from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from database import get_db_cursor
from utils.auth import get_current_user, verify_csrf
from utils.helpers import log_user_action
from datetime import datetime, timedelta

router = APIRouter(prefix="/admin", tags=["admin"])

class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None

@router.get("/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    """Get all users"""
    if current_user["role"] not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    with get_db_cursor() as cur:
        cur.execute("""
            SELECT u.*, 
                   COUNT(b.booking_id) as total_bookings,
                   COALESCE(SUM(e.ticket_price), 0) as total_spent,
                   MAX(b.created_at) as last_activity
            FROM users u
            LEFT JOIN bookings b ON u.user_id = b.user_id
            LEFT JOIN events e ON b.event_id = e.event_id
            GROUP BY u.user_id
            ORDER BY u.created_at DESC
        """)
        users = cur.fetchall()
        
        # Add stats to each user
        for user in users:
            user['stats'] = {
                'total_bookings': user.pop('total_bookings'),
                'total_spent': user.pop('total_spent'),
                'last_activity': user.pop('last_activity')
            }
        
        return users

@router.get("/users/{user_id}")
async def get_user_details(
    user_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Get user details"""
    if current_user["role"] not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    with get_db_cursor() as cur:
        # Get user details
        cur.execute(
            """
            SELECT u.user_id, u.username, u.email, u.role, u.is_active,
                   u.created_at, p.first_name, p.last_name, p.phone, p.birth_date
            FROM users u
            LEFT JOIN user_profiles p ON u.user_id = p.user_id
            WHERE u.user_id = %s
            """,
            (user_id,)
        )
        user = cur.fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        # Get user statistics
        cur.execute(
            """
            SELECT 
                COUNT(b.booking_id) as total_bookings,
                COALESCE(SUM(t.amount), 0) as total_spent,
                MAX(b.booking_date) as last_activity
            FROM users u
            LEFT JOIN bookings b ON u.user_id = b.user_id
            LEFT JOIN transactions t ON b.booking_id = t.booking_id AND t.status = 'completed'
            WHERE u.user_id = %s
            GROUP BY u.user_id
            """,
            (user_id,)
        )
        stats = cur.fetchone() or {
            "total_bookings": 0,
            "total_spent": 0,
            "last_activity": None
        }
        
        return {**user, "stats": stats}

@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    user_update: dict,
    current_user: dict = Depends(verify_csrf())
):
    """Update user role or status"""
    if current_user["role"] not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    # Only admins can change roles
    if "role" in user_update and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Только администраторы могут изменять роли пользователей")
    
    # Prevent changing own role
    if user_id == current_user["user_id"] and "role" in user_update:
        raise HTTPException(status_code=403, detail="Нельзя изменить свою роль")
    
    # Prevent moderators from modifying admin users
    with get_db_cursor() as cur:
        cur.execute("SELECT role FROM users WHERE user_id = %s", (user_id,))
        target_user = cur.fetchone()
        
        if not target_user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        if current_user["role"] == "moderator" and target_user["role"] == "admin":
            raise HTTPException(status_code=403, detail="Модераторы не могут изменять администраторов")
    
    # Update user
    with get_db_cursor(commit=True) as cur:
        # Build update query
        update_fields = []
        params = []
        
        if "role" in user_update:
            update_fields.append("role = %s")
            params.append(user_update["role"])
        
        if "is_active" in user_update:
            update_fields.append("is_active = %s")
            params.append(user_update["is_active"])
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="Нет данных для обновления")
        
        params.append(user_id)
        
        # Execute update
        cur.execute(f"""
            UPDATE users 
            SET {", ".join(update_fields)}
            WHERE user_id = %s
            RETURNING *
        """, params)
        
        updated_user = cur.fetchone()
        
        # Log the action
        log_user_action(
            current_user["user_id"],
            "update_user", 
            {
                "target_user_id": user_id,
                "changes": user_update
            }
        )
        
        return updated_user

@router.get("/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    """Get admin statistics"""
    if current_user["role"] not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    with get_db_cursor() as cur:
        # Get overall statistics
        cur.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM events) as total_events,
                (SELECT COUNT(*) FROM bookings WHERE status = 'confirmed') as total_bookings,
                (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE status = 'completed') as total_revenue
            """
        )
        overall_stats = cur.fetchone()
        
        # Get upcoming events statistics
        cur.execute(
            """
            SELECT e.event_id, e.title,
                   COUNT(b.booking_id) as total_bookings,
                   e.capacity,
                   (COUNT(b.booking_id)::float / NULLIF(e.capacity, 0) * 100)::numeric(5,2) as booking_percentage
            FROM events e
            LEFT JOIN bookings b ON e.event_id = b.event_id AND b.status = 'confirmed'
            WHERE e.event_date >= NOW()
            GROUP BY e.event_id, e.title, e.capacity
            ORDER BY e.event_date
            LIMIT 10
            """
        )
        upcoming_events_stats = cur.fetchall()
        
        # Get revenue by event category
        cur.execute(
            """
            SELECT c.name as category,
                   COUNT(DISTINCT e.event_id) as total_events,
                   COUNT(b.booking_id) as total_bookings,
                   COALESCE(SUM(t.amount), 0) as revenue
            FROM event_categories c
            LEFT JOIN events e ON c.category_id = e.category_id
            LEFT JOIN bookings b ON e.event_id = b.event_id
            LEFT JOIN transactions t ON b.booking_id = t.booking_id AND t.status = 'completed'
            GROUP BY c.category_id, c.name
            ORDER BY revenue DESC
            """
        )
        category_stats = cur.fetchall()
        
        return {
            "overall": overall_stats,
            "upcoming_events": upcoming_events_stats,
            "categories": category_stats
        }

@router.get("/logs")
async def get_audit_logs(
    current_user: dict = Depends(get_current_user),
    limit: int = 100,
    offset: int = 0,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
):
    """Get audit logs with filtering options"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Только администраторы могут просматривать журнал действий")

    try:
        with get_db_cursor() as cur:
            # Build query conditions
            conditions = []
            params = []
            
            if user_id:
                conditions.append("l.user_id = %s")
                params.append(user_id)
                
            if action:
                conditions.append("l.action = %s")
                params.append(action)
                
            if start_date:
                conditions.append("l.action_date >= %s")
                params.append(start_date)
                
            if end_date:
                conditions.append("l.action_date <= %s")
                params.append(end_date)
            
            # Build WHERE clause
            where_clause = " AND ".join(conditions) if conditions else "1=1"
            
            # Get total count
            cur.execute(f"""
                SELECT COUNT(*) as total
                FROM audit_logs l
                WHERE {where_clause}
            """, params)
            
            total = cur.fetchone()["total"]
            
            # Get logs with user info
            cur.execute(f"""
                SELECT l.*,
                       u.username,
                       u.first_name || ' ' || u.last_name as full_name
                FROM audit_logs l
                JOIN users u ON l.user_id = u.user_id
                WHERE {where_clause}
                ORDER BY l.action_date DESC
                LIMIT %s OFFSET %s
            """, params + [limit, offset])
            
            logs = cur.fetchall()
            
            return {
                "total": total,
                "logs": logs
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def log_action(cur, user_id: int, action: str, details: dict = None):
    """Log an action in the audit_logs table"""
    cur.execute("""
        INSERT INTO audit_logs (user_id, action, details)
        VALUES (%s, %s, %s)
    """, (user_id, action, details))