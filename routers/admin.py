# routers/admin.py - Enhanced with proper role restrictions and event management
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from database import get_db_cursor
from utils.auth import get_current_user, verifier, SessionData
from utils.helpers import log_user_action
from datetime import datetime, timedelta

router = APIRouter(prefix="/admin", tags=["admin"])

class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None

def require_admin(session: SessionData = Depends(verifier)):
    """Dependency to require admin role"""
    if session.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin role required.")
    return session

def require_admin_or_moderator(session: SessionData = Depends(verifier)):
    """Dependency to require admin or moderator role"""
    if session.role not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Access denied. Admin or moderator role required.")
    return session

@router.get("/users")
async def get_users(session: SessionData = Depends(require_admin_or_moderator)):
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
    session: SessionData = Depends(require_admin_or_moderator)
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
    user_update: UserUpdate,
    session: SessionData = Depends(require_admin)
):
    """Update user role or status"""
    with get_db_cursor(commit=True) as cur:
        # Check if user exists
        cur.execute(
            "SELECT * FROM users WHERE user_id = %s",
            (user_id,)
        )
        user = cur.fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Prevent self-demotion
        if user_id == session.user_id and user_update.role and user_update.role != "admin":
            raise HTTPException(status_code=400, detail="Cannot demote yourself from admin")
        
        # Build update query
        update_fields = []
        params = []
        
        if user_update.role is not None:
            if user_update.role not in ["admin", "moderator", "user"]:
                raise HTTPException(status_code=400, detail="Invalid role")
            update_fields.append("role = %s")
            params.append(user_update.role)
        
        if user_update.is_active is not None:
            update_fields.append("is_active = %s")
            params.append(user_update.is_active)
        
        if update_fields:
            params.append(user_id)
            query = f"""
                UPDATE users
                SET {", ".join(update_fields)}
                WHERE user_id = %s
                RETURNING *
            """
            cur.execute(query, params)
            updated_user = cur.fetchone()
            
            # Log the action
            log_user_action(
                session.user_id,
                "update_user",
                {
                    "target_user_id": user_id,
                    "updated_fields": [f.split(" = ")[0] for f in update_fields]
                }
            )
            
            return updated_user
        
        return user

@router.get("/events")
async def get_admin_events(
    session: SessionData = Depends(require_admin_or_moderator),
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
async def get_stats(session: SessionData = Depends(require_admin_or_moderator)):
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

@router.get("/audit-logs")
async def get_audit_logs(
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    session: SessionData = Depends(require_admin)
):
    """Get audit logs with optional filters"""
    with get_db_cursor() as cur:
        conditions = []
        params = []
        
        if user_id:
            conditions.append("user_id = %s")
            params.append(user_id)
        
        if action:
            conditions.append("action = %s")
            params.append(action)
        
        if from_date:
            conditions.append("timestamp >= %s")
            params.append(from_date)
        
        if to_date:
            conditions.append("timestamp <= %s")
            params.append(to_date)
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        query = f"""
            SELECT l.*, u.username
            FROM audit_logs l
            JOIN users u ON l.user_id = u.user_id
            WHERE {where_clause}
            ORDER BY l.timestamp DESC
            LIMIT 1000
        """
        cur.execute(query, params)
        logs = cur.fetchall()
        return logs

@router.get("/system-health")
async def get_system_health(session: SessionData = Depends(require_admin)):
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
async def cleanup_system(session: SessionData = Depends(require_admin)):
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
                session.user_id,
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
async def export_users(session: SessionData = Depends(require_admin)):
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
                session.user_id,
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
    session: SessionData = Depends(require_admin)
):
    """Update event status via admin panel"""
    if session.role not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    try:
        new_status = status_data.get("status")
        if not new_status:
            raise HTTPException(status_code=400, detail="Статус не указан")
        
        # Forward to events router
        from routers.events import update_event_status, EventStatusUpdate
        
        status_update = EventStatusUpdate(status=new_status)
        return await update_event_status(event_id, status_update, session)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/statistics")
async def get_statistics(session: SessionData = Depends(require_admin)):
    """Get system statistics"""
    with get_db_cursor() as cur:
        # User statistics
        cur.execute("""
            SELECT
                COUNT(*) as total_users,
                COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_count,
                COUNT(CASE WHEN role = 'moderator' THEN 1 END) as moderator_count,
                COUNT(CASE WHEN is_active = true THEN 1 END) as active_users
            FROM users
        """)
        user_stats = cur.fetchone()
        
        # Event statistics
        cur.execute("""
            SELECT
                COUNT(*) as total_events,
                COUNT(CASE WHEN event_date > NOW() THEN 1 END) as upcoming_events,
                COUNT(CASE WHEN status = 'published' THEN 1 END) as published_events,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_events
            FROM events
        """)
        event_stats = cur.fetchone()
        
        # Booking statistics
        cur.execute("""
            SELECT
                COUNT(*) as total_bookings,
                COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_bookings,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings,
                COALESCE(SUM(price), 0) as total_revenue
            FROM bookings
        """)
        booking_stats = cur.fetchone()
        
        # Recent activity
        cur.execute("""
            SELECT l.*, u.username
            FROM audit_logs l
            JOIN users u ON l.user_id = u.user_id
            ORDER BY l.timestamp DESC
            LIMIT 10
        """)
        recent_activity = cur.fetchall()
        
        return {
            "users": user_stats,
            "events": event_stats,
            "bookings": booking_stats,
            "recent_activity": recent_activity
        }