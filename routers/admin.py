# routers/admin.py - Enhanced with proper role restrictions and event management
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

def require_admin(current_user: dict = Depends(get_current_user)):
    """Dependency to require admin role"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещен. Требуются права администратора.")
    return current_user

def require_admin_or_moderator(current_user: dict = Depends(get_current_user)):
    """Dependency to require admin or moderator role"""
    if current_user["role"] not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен. Требуются права администратора или модератора.")
    return current_user

@router.get("/users")
async def get_users(current_user: dict = Depends(require_admin_or_moderator)):
    """Get all users - available for admin and moderator"""
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT u.user_id, u.username, u.email, u.role, u.is_active, u.created_at,
                   p.first_name, p.last_name, p.phone, p.birth_date,
                   COUNT(b.booking_id) as total_bookings,
                   COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.amount ELSE 0 END), 0) as total_spent,
                   MAX(b.booking_date) as last_activity
            FROM users u
            LEFT JOIN user_profiles p ON u.user_id = p.user_id
            LEFT JOIN bookings b ON u.user_id = b.user_id
            LEFT JOIN transactions t ON b.booking_id = t.booking_id
            GROUP BY u.user_id, p.profile_id
            ORDER BY u.created_at DESC
        """)
        users = cur.fetchall()
        
        # Add stats to each user
        result = []
        for user in users:
            user_dict = dict(user)
            user_dict['stats'] = {
                'total_bookings': user_dict.pop('total_bookings'),
                'total_spent': user_dict.pop('total_spent'),
                'last_activity': user_dict.pop('last_activity')
            }
            result.append(user_dict)
        
        return result

@router.get("/users/{user_id}")
async def get_user_details(
    user_id: int,
    current_user: dict = Depends(require_admin_or_moderator)
):
    """Get user details - available for admin and moderator"""
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
                COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.amount ELSE 0 END), 0) as total_spent,
                MAX(b.booking_date) as last_activity
            FROM bookings b
            LEFT JOIN transactions t ON b.booking_id = t.booking_id
            WHERE b.user_id = %s
            """,
            (user_id,)
        )
        stats = cur.fetchone() or {
            "total_bookings": 0,
            "total_spent": 0,
            "last_activity": None
        }
        
        return {**dict(user), "stats": dict(stats)}

@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    user_update: dict,
    current_user: dict = Depends(verify_csrf())
):
    """Update user role or status with role-based restrictions"""
    # Basic permission check
    if current_user["role"] not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    # Role change restrictions - ONLY ADMIN can change roles
    if "role" in user_update:
        if current_user["role"] != "admin":
            raise HTTPException(
                status_code=403, 
                detail="Только администраторы могут изменять роли пользователей"
            )
    
    # Prevent changing own role or status
    if user_id == current_user["user_id"]:
        raise HTTPException(
            status_code=403, 
            detail="Нельзя изменить свою роль или статус"
        )
    
    # Moderators cannot modify admin users
    with get_db_cursor() as cur:
        cur.execute("SELECT role FROM users WHERE user_id = %s", (user_id,))
        target_user = cur.fetchone()
        
        if not target_user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        if current_user["role"] == "moderator" and target_user["role"] == "admin":
            raise HTTPException(
                status_code=403, 
                detail="Модераторы не могут изменять администраторов"
            )
    
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
                "changes": user_update,
                "performer_role": current_user["role"]
            }
        )
        
        return dict(updated_user)

@router.get("/events")
async def get_admin_events(
    current_user: dict = Depends(require_admin_or_moderator),
    status: Optional[str] = None,
    include_past: bool = False
):
    """Get all events for admin management"""
    with get_db_cursor() as cur:
        query = """
            SELECT e.*, c.name as category_name,
                   COUNT(b.booking_id) as total_bookings,
                   COUNT(CASE WHEN b.status = 'confirmed' THEN 1 END) as confirmed_bookings,
                   COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.amount ELSE 0 END), 0) as revenue
            FROM events e
            LEFT JOIN event_categories c ON e.category_id = c.category_id
            LEFT JOIN bookings b ON e.event_id = b.event_id
            LEFT JOIN transactions t ON b.booking_id = t.booking_id
            WHERE 1=1
        """
        params = []
        
        if not include_past:
            query += " AND e.event_date >= NOW()"
        
        if status:
            query += " AND e.status = %s"
            params.append(status)
        
        query += """
            GROUP BY e.event_id, c.name
            ORDER BY e.event_date DESC
        """
        
        cur.execute(query, params)
        events = cur.fetchall()
        
        return [dict(event) for event in events]

@router.get("/stats")
async def get_stats(current_user: dict = Depends(require_admin_or_moderator)):
    """Get admin statistics - available for admin and moderator"""
    with get_db_cursor() as cur:
        # Get overall statistics
        cur.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM users WHERE is_active = true) as total_users,
                (SELECT COUNT(*) FROM events WHERE event_date >= NOW()) as total_events,
                (SELECT COUNT(*) FROM events WHERE event_date >= NOW() AND status = 'active') as active_events,
                (SELECT COUNT(*) FROM events WHERE event_date >= NOW() AND status = 'planned') as planned_events,
                (SELECT COUNT(*) FROM bookings WHERE status = 'confirmed') as total_bookings,
                (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE status = 'completed') as total_revenue
            """
        )
        overall_stats = cur.fetchone()
        
        # Get upcoming events statistics
        cur.execute(
            """
            SELECT e.event_id, e.title, e.event_date, e.status,
                   COUNT(b.booking_id) as total_bookings,
                   e.capacity,
                   (COUNT(b.booking_id)::float / NULLIF(e.capacity, 0) * 100)::numeric(5,2) as booking_percentage
            FROM events e
            LEFT JOIN bookings b ON e.event_id = b.event_id AND b.status = 'confirmed'
            WHERE e.event_date >= NOW()
            GROUP BY e.event_id, e.title, e.capacity, e.event_date, e.status
            ORDER BY e.event_date
            LIMIT 10
            """
        )
        upcoming_events_stats = cur.fetchall()
        
        # Get revenue by event category
        cur.execute(
            """
            SELECT COALESCE(c.name, 'Без категории') as category,
                   COUNT(DISTINCT e.event_id) as total_events,
                   COUNT(b.booking_id) as total_bookings,
                   COALESCE(SUM(t.amount), 0) as revenue
            FROM events e
            LEFT JOIN event_categories c ON e.category_id = c.category_id
            LEFT JOIN bookings b ON e.event_id = b.event_id AND b.status = 'confirmed'
            LEFT JOIN transactions t ON b.booking_id = t.booking_id AND t.status = 'completed'
            GROUP BY c.category_id, c.name
            ORDER BY revenue DESC
            """
        )
        category_stats = cur.fetchall()
        
        # Get event zones statistics
        cur.execute(
            """
            SELECT z.name as zone_name,
                   COUNT(DISTINCT ez.event_id) as events_using_zone,
                   AVG(ez.zone_price) as avg_price,
                   SUM(ez.available_seats) as total_capacity
            FROM club_zones z
            LEFT JOIN event_zones ez ON z.zone_id = ez.zone_id
            GROUP BY z.zone_id, z.name
            ORDER BY events_using_zone DESC
            """
        )
        zone_stats = cur.fetchall()
        
        return {
            "overall": dict(overall_stats),
            "upcoming_events": [dict(event) for event in upcoming_events_stats],
            "categories": [dict(cat) for cat in category_stats],
            "zones": [dict(zone) for zone in zone_stats]
        }

@router.get("/logs")
async def get_audit_logs(
    current_user: dict = Depends(require_admin),  # ONLY ADMIN can view logs
    limit: int = 100,
    offset: int = 0,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
):
    """Get audit logs with filtering options - ADMIN ONLY"""
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
                       COALESCE(p.first_name || ' ' || p.last_name, u.username) as full_name,
                       u.role as user_role
                FROM audit_logs l
                JOIN users u ON l.user_id = u.user_id
                LEFT JOIN user_profiles p ON u.user_id = p.user_id
                WHERE {where_clause}
                ORDER BY l.action_date DESC
                LIMIT %s OFFSET %s
            """, params + [limit, offset])
            
            logs = cur.fetchall()
            
            return {
                "total": total,
                "logs": [dict(log) for log in logs],
                "message": f"Загружено {len(logs)} записей из {total}"
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки логов: {str(e)}")

@router.get("/system-health")
async def get_system_health(current_user: dict = Depends(require_admin)):
    """Get system health information - ADMIN ONLY"""
    try:
        with get_db_cursor() as cur:
            health_data = {}
            
            # Database connectivity
            cur.execute("SELECT 1 as test")
            health_data["database"] = "OK"
            
            # Table status
            cur.execute("""
                SELECT table_name, 
                       (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
                FROM information_schema.tables t
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                ORDER BY table_name
            """)
            tables = cur.fetchall()
            health_data["tables"] = [dict(table) for table in tables]
            
            # Recent activity
            cur.execute("""
                SELECT 
                    (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '24 hours') as new_users_24h,
                    (SELECT COUNT(*) FROM events WHERE created_at >= NOW() - INTERVAL '24 hours') as new_events_24h,
                    (SELECT COUNT(*) FROM bookings WHERE booking_date >= NOW() - INTERVAL '24 hours') as new_bookings_24h,
                    (SELECT COUNT(*) FROM audit_logs WHERE action_date >= NOW() - INTERVAL '24 hours') as log_entries_24h
            """)
            activity = cur.fetchone()
            health_data["activity_24h"] = dict(activity)
            
            # Event status distribution
            cur.execute("""
                SELECT status, COUNT(*) as count
                FROM events
                WHERE event_date >= NOW()
                GROUP BY status
            """)
            event_status = cur.fetchall()
            health_data["event_status"] = [dict(status) for status in event_status]
            
            return {
                "status": "healthy",
                "timestamp": datetime.now().isoformat(),
                "details": health_data
            }
            
    except Exception as e:
        return {
            "status": "unhealthy",
            "timestamp": datetime.now().isoformat(),
            "error": str(e)
        }

@router.post("/cleanup")
async def cleanup_system(current_user: dict = Depends(require_admin)):
    """Cleanup system data - ADMIN ONLY"""
    try:
        with get_db_cursor(commit=True) as cur:
            cleanup_results = {}
            
            # Clean up expired pending bookings (older than 30 minutes)
            cur.execute("""
                DELETE FROM bookings 
                WHERE status = 'pending' 
                AND booking_date < NOW() - INTERVAL '30 minutes'
            """)
            cleanup_results["expired_bookings"] = cur.rowcount
            
            # Clean up old audit logs (older than 90 days)
            cur.execute("""
                DELETE FROM audit_logs 
                WHERE action_date < NOW() - INTERVAL '90 days'
            """)
            cleanup_results["old_audit_logs"] = cur.rowcount
            
            # Update event statuses for past events
            cur.execute("""
                UPDATE events 
                SET status = 'cancelled' 
                WHERE event_date < NOW() - INTERVAL '1 day' 
                AND status IN ('planned', 'active')
            """)
            cleanup_results["auto_cancelled_events"] = cur.rowcount
            
            # Log the cleanup action
            log_user_action(
                current_user["user_id"],
                "system_cleanup",
                cleanup_results
            )
            
            return {
                "message": "Система успешно очищена",
                "cleanup_results": cleanup_results
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка очистки системы: {str(e)}")

@router.get("/export/users")
async def export_users(current_user: dict = Depends(require_admin)):
    """Export users data - ADMIN ONLY"""
    try:
        with get_db_cursor() as cur:
            cur.execute("""
                SELECT u.user_id, u.username, u.email, u.role, u.is_active, u.created_at,
                       p.first_name, p.last_name, p.phone, p.birth_date,
                       COUNT(b.booking_id) as total_bookings,
                       COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.amount ELSE 0 END), 0) as total_spent
                FROM users u
                LEFT JOIN user_profiles p ON u.user_id = p.user_id
                LEFT JOIN bookings b ON u.user_id = b.user_id
                LEFT JOIN transactions t ON b.booking_id = t.booking_id
                GROUP BY u.user_id, p.profile_id
                ORDER BY u.created_at DESC
            """)
            users = cur.fetchall()
            
            # Log the export action
            log_user_action(
                current_user["user_id"],
                "export_users",
                {"exported_count": len(users)}
            )
            
            return {
                "users": [dict(user) for user in users],
                "exported_at": datetime.now().isoformat(),
                "total_count": len(users)
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка экспорта пользователей: {str(e)}")

@router.patch("/events/{event_id}/status")
async def update_event_status_admin(
    event_id: int,
    status_data: dict,
    current_user: dict = Depends(verify_csrf())
):
    """Update event status via admin panel"""
    if current_user["role"] not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    try:
        new_status = status_data.get("status")
        if not new_status:
            raise HTTPException(status_code=400, detail="Статус не указан")
        
        # Forward to events router
        from routers.events import update_event_status, EventStatusUpdate
        
        status_update = EventStatusUpdate(status=new_status)
        return await update_event_status(event_id, status_update, current_user)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))