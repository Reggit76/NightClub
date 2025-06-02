"""
Helper utilities for the Nightclub Booking System
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import re
from database import get_db_cursor

def validate_phone_number(phone: str) -> bool:
    """Validate phone number format"""
    if not phone:
        return True  # Phone is optional
    
    # Russian phone number pattern
    pattern = r'^(\+7|8)?[\s\-\(]?(\d{3})[\s\-\)]?(\d{3})[\s\-]?(\d{2})[\s\-]?(\d{2})$'
    return bool(re.match(pattern, phone))

def format_phone_number(phone: str) -> str:
    """Format phone number to standard format"""
    if not phone:
        return phone
    
    # Remove all non-digits
    digits = re.sub(r'\D', '', phone)
    
    # Handle Russian numbers
    if digits.startswith('8') and len(digits) == 11:
        digits = '7' + digits[1:]
    elif digits.startswith('7') and len(digits) == 11:
        pass  # Already correct
    elif len(digits) == 10:
        digits = '7' + digits
    
    if len(digits) == 11 and digits.startswith('7'):
        return f"+7 ({digits[1:4]}) {digits[4:7]}-{digits[7:9]}-{digits[9:11]}"
    
    return phone  # Return original if can't format

def validate_event_time(event_date: datetime) -> bool:
    """Validate that event is scheduled for the future"""
    return event_date > datetime.now()

def calculate_event_end_time(event_date: datetime, duration_minutes: int) -> datetime:
    """Calculate event end time based on start time and duration"""
    return event_date + timedelta(minutes=duration_minutes)

def get_event_statistics(event_id: int) -> Dict[str, Any]:
    """Get comprehensive statistics for an event"""
    with get_db_cursor() as cur:
        # Basic event info
        cur.execute("""
            SELECT e.*, c.name as category_name
            FROM events e
            LEFT JOIN event_categories c ON e.category_id = c.category_id
            WHERE e.event_id = %s
        """, (event_id,))
        event = cur.fetchone()
        
        if not event:
            return {}
        
        # Booking statistics
        cur.execute("""
            SELECT 
                COUNT(*) as total_bookings,
                COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_bookings,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings
            FROM bookings
            WHERE event_id = %s
        """, (event_id,))
        booking_stats = cur.fetchone()
        
        # Revenue statistics
        cur.execute("""
            SELECT 
                COALESCE(SUM(t.amount), 0) as total_revenue,
                COUNT(t.transaction_id) as paid_transactions
            FROM bookings b
            LEFT JOIN transactions t ON b.booking_id = t.booking_id AND t.status = 'completed'
            WHERE b.event_id = %s
        """, (event_id,))
        revenue_stats = cur.fetchone()
        
        # Zone distribution
        cur.execute("""
            SELECT 
                z.name as zone_name,
                COUNT(b.booking_id) as bookings_count
            FROM club_zones z
            LEFT JOIN seats s ON z.zone_id = s.zone_id
            LEFT JOIN bookings b ON s.seat_id = b.seat_id AND b.event_id = %s AND b.status = 'confirmed'
            GROUP BY z.zone_id, z.name
            ORDER BY z.zone_id
        """, (event_id,))
        zone_stats = cur.fetchall()
        
        return {
            "event": dict(event),
            "bookings": dict(booking_stats),
            "revenue": dict(revenue_stats),
            "zones": [dict(zone) for zone in zone_stats],
            "occupancy_rate": round((booking_stats["confirmed_bookings"] / event["capacity"]) * 100, 2) if event["capacity"] > 0 else 0
        }

def get_user_booking_history(user_id: int, limit: int = 10) -> List[Dict[str, Any]]:
    """Get user's booking history with event details"""
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT 
                b.*,
                e.title as event_title,
                e.event_date,
                e.ticket_price,
                s.seat_number,
                z.name as zone_name,
                t.status as payment_status,
                t.payment_method,
                t.transaction_date
            FROM bookings b
            JOIN events e ON b.event_id = e.event_id
            JOIN seats s ON b.seat_id = s.seat_id
            JOIN club_zones z ON s.zone_id = z.zone_id
            LEFT JOIN transactions t ON b.booking_id = t.booking_id
            WHERE b.user_id = %s
            ORDER BY b.booking_date DESC
            LIMIT %s
        """, (user_id, limit))
        
        return [dict(booking) for booking in cur.fetchall()]

def check_seat_availability(event_id: int, seat_id: int) -> bool:
    """Check if a specific seat is available for an event"""
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) as count
            FROM bookings
            WHERE event_id = %s AND seat_id = %s AND status IN ('confirmed', 'pending')
        """, (event_id, seat_id))
        
        result = cur.fetchone()
        return result["count"] == 0

def get_available_seats_in_zone(event_id: int, zone_id: int) -> List[Dict[str, Any]]:
    """Get all available seats in a specific zone for an event"""
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT s.seat_id, s.seat_number
            FROM seats s
            LEFT JOIN bookings b ON s.seat_id = b.seat_id 
                AND b.event_id = %s 
                AND b.status IN ('confirmed', 'pending')
            WHERE s.zone_id = %s AND b.booking_id IS NULL
            ORDER BY s.seat_number
        """, (event_id, zone_id))
        
        return [dict(seat) for seat in cur.fetchall()]

def calculate_revenue_by_period(days: int = 30) -> Dict[str, Any]:
    """Calculate revenue statistics for a given period"""
    with get_db_cursor() as cur:
        start_date = datetime.now() - timedelta(days=days)
        
        # Total revenue
        cur.execute("""
            SELECT 
                COALESCE(SUM(amount), 0) as total_revenue,
                COUNT(*) as total_transactions
            FROM transactions
            WHERE status = 'completed' AND transaction_date >= %s
        """, (start_date,))
        total_stats = cur.fetchone()
        
        # Daily revenue
        cur.execute("""
            SELECT 
                DATE(transaction_date) as date,
                SUM(amount) as daily_revenue,
                COUNT(*) as daily_transactions
            FROM transactions
            WHERE status = 'completed' AND transaction_date >= %s
            GROUP BY DATE(transaction_date)
            ORDER BY date DESC
        """, (start_date,))
        daily_stats = cur.fetchall()
        
        # Revenue by payment method
        cur.execute("""
            SELECT 
                payment_method,
                SUM(amount) as revenue,
                COUNT(*) as transactions
            FROM transactions
            WHERE status = 'completed' AND transaction_date >= %s
            GROUP BY payment_method
            ORDER BY revenue DESC
        """, (start_date,))
        payment_method_stats = cur.fetchall()
        
        return {
            "period_days": days,
            "total": dict(total_stats),
            "daily": [dict(day) for day in daily_stats],
            "by_payment_method": [dict(method) for method in payment_method_stats]
        }

def log_user_action(user_id: int, action: str, details: Optional[Dict[str, Any]] = None):
    """Log user action to audit_logs table"""
    with get_db_cursor(commit=True) as cur:
        details_json = str(details) if details else None
        cur.execute("""
            INSERT INTO audit_logs (user_id, action, details)
            VALUES (%s, %s, %s)
        """, (user_id, action, details_json))

def get_popular_events(limit: int = 5) -> List[Dict[str, Any]]:
    """Get most popular events based on booking count"""
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT 
                e.*,
                c.name as category_name,
                COUNT(b.booking_id) as booking_count,
                ROUND((COUNT(b.booking_id)::float / e.capacity) * 100, 2) as occupancy_percentage
            FROM events e
            LEFT JOIN event_categories c ON e.category_id = c.category_id
            LEFT JOIN bookings b ON e.event_id = b.event_id AND b.status = 'confirmed'
            WHERE e.event_date >= NOW()
            GROUP BY e.event_id, c.name
            ORDER BY booking_count DESC, e.event_date
            LIMIT %s
        """, (limit,))
        
        return [dict(event) for event in cur.fetchall()]

def send_email_notification(to_email: str, subject: str, message: str) -> bool:
    """
    Placeholder for email notification functionality
    In production, integrate with email service like SendGrid, SES, etc.
    """
    # This is a mock implementation
    print(f"📧 Email notification:")
    print(f"To: {to_email}")
    print(f"Subject: {subject}")
    print(f"Message: {message}")
    return True

def generate_booking_confirmation_message(booking_id: int) -> str:
    """Generate booking confirmation message"""
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT 
                b.*,
                e.title as event_title,
                e.event_date,
                e.ticket_price,
                s.seat_number,
                z.name as zone_name,
                u.username,
                u.email
            FROM bookings b
            JOIN events e ON b.event_id = e.event_id
            JOIN seats s ON b.seat_id = s.seat_id
            JOIN club_zones z ON s.zone_id = z.zone_id
            JOIN users u ON b.user_id = u.user_id
            WHERE b.booking_id = %s
        """, (booking_id,))
        
        booking = cur.fetchone()
        if not booking:
            return "Booking not found"
        
        return f"""
        🎪 Подтверждение бронирования

        Дорогой {booking['username']}!

        Ваше бронирование успешно подтверждено:

        🎵 Мероприятие: {booking['event_title']}
        📅 Дата: {booking['event_date'].strftime('%d.%m.%Y %H:%M')}
        🎯 Зона: {booking['zone_name']}
        💺 Место: {booking['seat_number']}
        💰 Цена: {booking['ticket_price']} ₽

        📱 Номер бронирования: {booking['booking_id']}

        Увидимся на мероприятии!
        """

def cleanup_expired_pending_bookings():
    """Remove pending bookings older than 15 minutes"""
    with get_db_cursor(commit=True) as cur:
        expiry_time = datetime.now() - timedelta(minutes=15)
        
        # Delete expired pending bookings
        cur.execute("""
            DELETE FROM bookings
            WHERE status = 'pending' AND booking_date < %s
        """, (expiry_time,))
        
        deleted_count = cur.rowcount
        if deleted_count > 0:
            print(f"🧹 Cleaned up {deleted_count} expired pending bookings")
        
        return deleted_count