from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, validator
from typing import Optional, List
from datetime import datetime, timedelta
from database import get_db_cursor
from utils.auth import get_current_user, check_role, verify_csrf
from utils.helpers import log_user_action
from fastapi.responses import JSONResponse

router = APIRouter()

class EventCreate(BaseModel):
    category_id: Optional[int] = None
    title: str
    description: str
    event_date: datetime
    duration: int  # in minutes
    capacity: int
    ticket_price: float
    
    @validator('event_date')
    def validate_event_date(cls, v):
        if v <= datetime.now():
            raise ValueError('Дата мероприятия должна быть в будущем')
        return v
    
    @validator('duration')
    def validate_duration(cls, v):
        if v < 30:
            raise ValueError('Длительность должна быть не менее 30 минут')
        return v
    
    @validator('capacity')
    def validate_capacity(cls, v):
        if v < 1:
            raise ValueError('Вместимость должна быть больше 0')
        return v
    
    @validator('ticket_price')
    def validate_ticket_price(cls, v):
        if v < 0:
            raise ValueError('Стоимость билета не может быть отрицательной')
        return v

class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    event_date: Optional[datetime] = None
    duration: Optional[int] = None
    capacity: Optional[int] = None
    ticket_price: Optional[float] = None
    
    @validator('event_date')
    def validate_event_date(cls, v):
        if v and v <= datetime.now():
            raise ValueError('Дата мероприятия должна быть в будущем')
        return v
    
    @validator('duration')
    def validate_duration(cls, v):
        if v and v < 30:
            raise ValueError('Длительность должна быть не менее 30 минут')
        return v
    
    @validator('capacity')
    def validate_capacity(cls, v):
        if v and v < 1:
            raise ValueError('Вместимость должна быть больше 0')
        return v
    
    @validator('ticket_price')
    def validate_ticket_price(cls, v):
        if v and v < 0:
            raise ValueError('Стоимость билета не может быть отрицательной')
        return v

@router.get("/categories")
async def get_categories():
    """Get all event categories"""
    with get_db_cursor() as cur:
        cur.execute("SELECT * FROM event_categories ORDER BY name")
        categories = cur.fetchall()
        return categories

@router.get("/zones")
async def get_zones():
    """Get all available zones with seat information"""
    with get_db_cursor() as cur:
        cur.execute("""
            SELECT z.zone_id, z.name, z.description, z.capacity,
                   COUNT(s.seat_id) as total_seats
            FROM club_zones z
            LEFT JOIN seats s ON z.zone_id = s.zone_id
            GROUP BY z.zone_id, z.name, z.description, z.capacity
            ORDER BY z.zone_id
        """)
        zones = cur.fetchall()
        
        # Add available seats count (simplified for demo)
        for zone in zones:
            zone['available_seats'] = zone['total_seats'] or 0
        
        return zones

@router.get("/")
async def get_events(
    category: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None
):
    """Get all events with optional filtering"""
    try:
        with get_db_cursor() as cur:
            query = """
                SELECT e.*, c.name as category_name,
                       (SELECT COUNT(*) FROM bookings b WHERE b.event_id = e.event_id AND b.status = 'confirmed') as booked_seats
                FROM events e
                LEFT JOIN event_categories c ON e.category_id = c.category_id
                WHERE e.event_date >= NOW()
            """
            params = []
            
            if category:
                query += " AND e.category_id = %s"
                params.append(category)
            if date_from:
                query += " AND e.event_date >= %s"
                params.append(date_from)
            if date_to:
                query += " AND e.event_date <= %s"
                params.append(date_to)
                
            query += " ORDER BY e.event_date"
            
            cur.execute(query, params)
            events = cur.fetchall()
            return events
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", status_code=201)
async def create_event(
    event: EventCreate,
    current_user: dict = Depends(verify_csrf())
):
    """Create a new event"""
    # Check if user has admin or moderator role
    if not current_user.get("role") or current_user["role"] not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав для создания мероприятий")
        
    try:
        with get_db_cursor(commit=True) as cur:
            # Validate category if provided
            if event.category_id:
                cur.execute("SELECT * FROM event_categories WHERE category_id = %s", (event.category_id,))
                if not cur.fetchone():
                    raise HTTPException(status_code=400, detail="Указанная категория не существует")
            
            cur.execute(
                """
                INSERT INTO events (category_id, title, description, event_date, duration,
                                  capacity, ticket_price, created_by, status)
                VALUES (%s, %s, %s, %s, %s::interval, %s, %s, %s, 'planned')
                RETURNING event_id, title, description, event_date, duration, capacity, ticket_price
                """,
                (event.category_id, event.title, event.description, event.event_date,
                 f"{event.duration} minutes", event.capacity, event.ticket_price,
                 current_user["user_id"])
            )
            new_event = cur.fetchone()
            
            # Log the action
            log_user_action(
                current_user["user_id"],
                "create_event",
                {
                    "event_id": new_event["event_id"],
                    "title": event.title,
                    "event_date": event.event_date.isoformat(),
                    "capacity": event.capacity
                }
            )
            
            return {
                **new_event,
                "booked_seats": 0,
                "category_name": None,
                "message": "Мероприятие успешно создано"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{event_id}")
async def update_event(
    event_id: int,
    event: EventUpdate,
    current_user: dict = Depends(verify_csrf())
):
    """Update an existing event"""
    # Check if user has admin or moderator role
    if not current_user.get("role") or current_user["role"] not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав для редактирования мероприятий")
        
    try:
        with get_db_cursor(commit=True) as cur:
            # Check if event exists and hasn't started
            cur.execute(
                """
                SELECT * FROM events 
                WHERE event_id = %s AND event_date > NOW()
                """, 
                (event_id,)
            )
            existing_event = cur.fetchone()
            if not existing_event:
                raise HTTPException(
                    status_code=404, 
                    detail="Мероприятие не найдено или уже началось"
                )
                
            # Build update query
            update_fields = []
            params = []
            for field, value in event.dict(exclude_unset=True).items():
                if value is not None:
                    if field == "duration":
                        update_fields.append(f"{field} = %s::interval")
                        params.append(f"{value} minutes")
                    else:
                        update_fields.append(f"{field} = %s")
                        params.append(value)
            
            if not update_fields:
                return {"message": "Нет данных для обновления"}
                
            params.append(event_id)
            query = f"""
                UPDATE events
                SET {", ".join(update_fields)}
                WHERE event_id = %s
                RETURNING event_id, title, description, event_date, duration, capacity, ticket_price
            """
            cur.execute(query, params)
            updated_event = cur.fetchone()
            
            # Log the action
            log_user_action(
                current_user["user_id"],
                "update_event",
                {
                    "event_id": event_id,
                    "updated_fields": list(event.dict(exclude_unset=True).keys())
                }
            )
            
            return updated_event
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{event_id}")
async def get_event(event_id: int):
    """Get a specific event by ID"""
    try:
        with get_db_cursor() as cur:
            cur.execute(
                """
                SELECT e.*, c.name as category_name,
                       (SELECT COUNT(*) FROM bookings b WHERE b.event_id = e.event_id AND b.status = 'confirmed') as booked_seats
                FROM events e
                LEFT JOIN event_categories c ON e.category_id = c.category_id
                WHERE e.event_id = %s
                """,
                (event_id,)
            )
            event = cur.fetchone()
            if not event:
                raise HTTPException(status_code=404, detail="Мероприятие не найдено")
                
            return event
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{event_id}/seats")
async def get_event_seats(event_id: int, zone_id: Optional[int] = None):
    """Get available seats for an event, optionally filtered by zone"""
    try:
        with get_db_cursor() as cur:
            # Check if event exists and hasn't started
            cur.execute(
                """
                SELECT * FROM events 
                WHERE event_id = %s AND event_date > NOW()
                """, 
                (event_id,)
            )
            if not cur.fetchone():
                raise HTTPException(
                    status_code=404, 
                    detail="Мероприятие не найдено или уже началось"
                )
                
            # Get seats for the zone
            query = """
                SELECT s.seat_id, s.seat_number, s.zone_id, z.name as zone_name,
                       CASE WHEN b.booking_id IS NOT NULL THEN true ELSE false END as is_booked
                FROM seats s
                JOIN club_zones z ON s.zone_id = z.zone_id
                LEFT JOIN bookings b ON s.seat_id = b.seat_id 
                    AND b.event_id = %s 
                    AND b.status IN ('confirmed', 'pending')
            """
            params = [event_id]
            
            if zone_id:
                query += " WHERE s.zone_id = %s"
                params.append(zone_id)
                
            query += " ORDER BY s.seat_number"
            
            cur.execute(query, params)
            seats = cur.fetchall()
            
            return {"seats": seats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{event_id}")
async def delete_event(
    event_id: int,
    current_user: dict = Depends(verify_csrf())
):
    """Delete an event"""
    # Check if user has admin or moderator role
    if not current_user.get("role") or current_user["role"] not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав для удаления мероприятий")
        
    try:
        with get_db_cursor(commit=True) as cur:
            # Check if event exists and has no bookings
            cur.execute(
                """
                SELECT e.*, COUNT(b.booking_id) as booking_count
                FROM events e
                LEFT JOIN bookings b ON e.event_id = b.event_id AND b.status IN ('confirmed', 'pending')
                WHERE e.event_id = %s AND e.event_date > NOW()
                GROUP BY e.event_id
                """,
                (event_id,)
            )
            event = cur.fetchone()
            
            if not event:
                raise HTTPException(
                    status_code=404, 
                    detail="Мероприятие не найдено или уже началось"
                )
            
            if event["booking_count"] > 0:
                raise HTTPException(
                    status_code=400, 
                    detail="Невозможно удалить мероприятие с существующими бронированиями"
                )
                
            cur.execute("DELETE FROM events WHERE event_id = %s", (event_id,))
            
            # Log the action
            log_user_action(
                current_user["user_id"],
                "delete_event",
                {
                    "event_id": event_id,
                    "title": event.get("title", "Unknown")
                }
            )
            
            return {"message": "Мероприятие успешно удалено"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{event_id}/statistics")
async def get_event_statistics(
    event_id: int,
    current_user: dict = Depends(check_role(["admin", "moderator"]))
):
    """Get detailed statistics for an event"""
    try:
        with get_db_cursor() as cur:
            # Basic event info
            cur.execute(
                """
                SELECT e.*, c.name as category_name
                FROM events e
                LEFT JOIN event_categories c ON e.category_id = c.category_id
                WHERE e.event_id = %s
                """,
                (event_id,)
            )
            event = cur.fetchone()
            
            if not event:
                raise HTTPException(status_code=404, detail="Мероприятие не найдено")
            
            # Booking statistics
            cur.execute(
                """
                SELECT 
                    COUNT(*) as total_bookings,
                    COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_bookings,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
                    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings
                FROM bookings
                WHERE event_id = %s
                """,
                (event_id,)
            )
            booking_stats = cur.fetchone()
            
            # Revenue statistics
            cur.execute(
                """
                SELECT 
                    COALESCE(SUM(t.amount), 0) as total_revenue,
                    COUNT(t.transaction_id) as paid_transactions
                FROM bookings b
                LEFT JOIN transactions t ON b.booking_id = t.booking_id AND t.status = 'completed'
                WHERE b.event_id = %s
                """,
                (event_id,)
            )
            revenue_stats = cur.fetchone()
            
            # Zone distribution
            cur.execute(
                """
                SELECT 
                    z.name as zone_name,
                    COUNT(b.booking_id) as bookings_count,
                    z.capacity as zone_capacity
                FROM club_zones z
                LEFT JOIN seats s ON z.zone_id = s.zone_id
                LEFT JOIN bookings b ON s.seat_id = b.seat_id AND b.event_id = %s AND b.status = 'confirmed'
                GROUP BY z.zone_id, z.name, z.capacity
                ORDER BY z.zone_id
                """,
                (event_id,)
            )
            zone_stats = cur.fetchall()
            
            occupancy_rate = 0
            if event["capacity"] > 0:
                occupancy_rate = round((booking_stats["confirmed_bookings"] / event["capacity"]) * 100, 2)
            
            return {
                "event": dict(event),
                "bookings": dict(booking_stats),
                "revenue": dict(revenue_stats),
                "zones": [dict(zone) for zone in zone_stats],
                "occupancy_rate": occupancy_rate
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))