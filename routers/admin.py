from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from database import get_db_cursor
from utils.auth import check_role, verify_csrf
from utils.helpers import log_user_action
from datetime import datetime

router = APIRouter()

class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None

@router.get("/users")
async def get_users(current_user: dict = Depends(check_role(["admin"]))):
    with get_db_cursor() as cur:
        cur.execute(
            """
            SELECT u.user_id, u.username, u.email, u.role, u.is_active,
                   u.created_at, p.first_name, p.last_name
            FROM users u
            LEFT JOIN user_profiles p ON u.user_id = p.user_id
            ORDER BY u.created_at DESC
            """
        )
        users = cur.fetchall()
        return users

@router.get("/users/{user_id}")
async def get_user_details(
    user_id: int,
    current_user: dict = Depends(check_role(["admin"]))
):
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
    user_update: UserUpdate,
    current_user: dict = Depends(verify_csrf())
):
    # Check if user has admin role
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Operation not permitted")
    
    if user_id == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="Невозможно изменить свою собственную роль")
        
    with get_db_cursor(commit=True) as cur:
        # Check if user exists
        cur.execute("SELECT * FROM users WHERE user_id = %s", (user_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Пользователь не найден")
            
        # Update user role and status
        update_fields = []
        params = []
        
        if user_update.role is not None:
            update_fields.append("role = %s")
            params.append(user_update.role)
            
        if user_update.is_active is not None:
            update_fields.append("is_active = %s")
            params.append(user_update.is_active)
            
        if not update_fields:
            return {"message": "Нет полей для обновления"}
            
        params.append(user_id)
        
        cur.execute(
            f"""
            UPDATE users
            SET {", ".join(update_fields)}
            WHERE user_id = %s
            """,
            params
        )
        
        # Log the action using the helper function
        details = {
            "target_user_id": user_id,
            "new_role": user_update.role,
            "new_status": user_update.is_active
        }
        
        log_user_action(
            current_user["user_id"],
            "update_user_role", 
            details
        )
        
        return {"message": "Пользователь успешно обновлен"}

@router.get("/stats")
async def get_stats(current_user: dict = Depends(check_role(["admin", "moderator"]))):
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