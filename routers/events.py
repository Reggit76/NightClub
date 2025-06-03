# routers/events.py - Enhanced with zone support and status management
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, validator
from typing import Optional, List
from datetime import datetime, timedelta
from database import get_db_cursor
from utils.auth import get_current_user, check_role, verify_csrf
from utils.helpers import log_user_action
from fastapi.responses import JSONResponse

router = APIRouter()

class EventZoneConfig(BaseModel):
    zone_id: int
    available_seats: int
    zone_price: float
    
    @validator('available_seats')
    def validate_available_seats(cls, v):
        if v < 0:
            raise ValueError('Количество мест не может быть отрицательным')
        return v
    
    @validator('zone_price')
    def validate_zone_price(cls, v):
        if v < 0:
            raise ValueError('Цена не может быть отрицательной')
        return v

class EventCreate(BaseModel):
    category_id: Optional[int] = None
    title: str
    description: str
    event_date: datetime
    duration: int  # in minutes
    zones: List[EventZoneConfig]  # Zone configuration
    status: Optional[str] = 'planned'  # planned, active, cancelled
    
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
    
    @validator('zones')
    def validate_zones(cls, v):
        if not v:
            raise ValueError('Необходимо указать хотя бы одну зону')
        
        zone_ids = [zone.zone_id for zone in v]
        if len(zone_ids) != len(set(zone_ids)):
            raise ValueError('Зоны не должны повторяться')
        
        return v
    
    @validator('status')
    def validate_status(cls, v):
        allowed_statuses = ['planned', 'active', 'cancelled']
        if v not in allowed_statuses:
            raise ValueError(f'Статус должен быть одним из: {", ".join(allowed_statuses)}')
        return v

class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    event_date: Optional[datetime] = None
    duration: Optional[int] = None
    zones: Optional[List[EventZoneConfig]] = None
    status: Optional[str] = None
    
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
    
    @validator('status')
    def validate_status(cls, v):
        if v:
            allowed_statuses = ['planned', 'active', 'cancelled']
            if v not in allowed_statuses:
                raise ValueError(f'Статус должен быть одним из: {", ".join(allowed_statuses)}')
        return v

class EventStatusUpdate(BaseModel):
    status: str
    
    @validator('status')
    def validate_status(cls, v):
        allowed_statuses = ['planned', 'active', 'cancelled']
        if v not in allowed_statuses:
            raise ValueError(f'Статус должен быть одним из: {", ".join(allowed_statuses)}')
        return v

@router.get("/categories")
async def get_categories():
    """Get all event categories"""
    try:
        with get_db_cursor() as cur:
            cur.execute("SELECT * FROM event_categories ORDER BY name")
            categories = cur.fetchall()
            return [dict(cat) for cat in categories]
    except Exception as e:
        print(f"Error getting categories: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/zones")
async def get_zones():
    """Get all available zones with seat information"""
    try:
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
            
            result = []
            for zone in zones:
                zone_dict = dict(zone)
                result.append(zone_dict)
            
            return result
    except Exception as e:
        print(f"Error getting zones: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/")
async def get_events(
    category: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    status: Optional[str] = Query(None, description="Event status filter"),
    include_all: Optional[bool] = Query(False, description="Include all events regardless of date"),
    current_user: Optional[dict] = Depends(get_current_user)
):
    """Get events with optional filtering"""
    try:
        with get_db_cursor() as cur:
            # Base query
            query = """
                SELECT e.*, c.name as category_name,
                       COALESCE(
                           (SELECT COUNT(*) FROM bookings b 
                            WHERE b.event_id = e.event_id AND b.status = 'confirmed'), 
                           0
                       ) as booked_seats
                FROM events e
                LEFT JOIN event_categories c ON e.category_id = c.category_id
                WHERE 1=1
            """
            params = []
            
            # Date filtering - show future events by default, unless include_all is True
            if not include_all:
                query += " AND e.event_date >= NOW()"
            
            # Status filtering - by default show only active events for regular users
            if status:
                query += " AND e.status = %s"
                params.append(status)
            elif not current_user or current_user.get('role') not in ['admin', 'moderator']:
                # Regular users see only active events
                query += " AND e.status = 'active'"
            # Admins and moderators see all events by default
            
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
            
            result = []
            for event in events:
                event_dict = dict(event)
                event_dict['booked_seats'] = int(event_dict.get('booked_seats', 0))
                
                # Get zone configurations for the event
                cur.execute("""
                    SELECT ez.*, z.name as zone_name, z.description as zone_description
                    FROM event_zones ez
                    JOIN club_zones z ON ez.zone_id = z.zone_id
                    WHERE ez.event_id = %s
                    ORDER BY z.name
                """, (event_dict['event_id'],))
                
                zones = cur.fetchall()
                event_dict['zones'] = [dict(zone) for zone in zones]
                
                result.append(event_dict)
            
            return result
    except Exception as e:
        print(f"Error in get_events: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.post("/", status_code=201)
async def create_event(
    event: EventCreate,
    current_user: dict = Depends(verify_csrf())
):
    """Create a new event with zone configuration"""
    print(f"=== CREATE EVENT WITH ZONES ===")
    print(f"Request data: {event.dict()}")
    print(f"Creating event by user: {current_user}")
    
    # Check if user has admin or moderator role
    user_role = current_user.get("role")
    print(f"User role: {user_role}")
    
    if not user_role or user_role not in ["admin", "moderator"]:
        print(f"User role check failed. User role: {user_role}")
        raise HTTPException(status_code=403, detail="Недостаточно прав для создания мероприятий")
        
    try:
        with get_db_cursor(commit=True) as cur:
            # Validate category if provided
            if event.category_id:
                print(f"Checking category: {event.category_id}")
                cur.execute("SELECT * FROM event_categories WHERE category_id = %s", (event.category_id,))
                category = cur.fetchone()
                if not category:
                    print(f"Category {event.category_id} not found")
                    raise HTTPException(status_code=400, detail="Указанная категория не существует")
                else:
                    print(f"Category found: {dict(category)}")
            
            # Validate zones exist
            zone_ids = [zone.zone_id for zone in event.zones]
            cur.execute(
                "SELECT zone_id FROM club_zones WHERE zone_id = ANY(%s)",
                (zone_ids,)
            )
            existing_zones = [row['zone_id'] for row in cur.fetchall()]
            
            missing_zones = set(zone_ids) - set(existing_zones)
            if missing_zones:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Зоны не найдены: {missing_zones}"
                )
            
            # Calculate total capacity
            total_capacity = sum(zone.available_seats for zone in event.zones)
            
            # Calculate minimum price for base ticket price
            min_price = min(zone.zone_price for zone in event.zones)
            
            print(f"Inserting event into database...")
            cur.execute(
                """
                INSERT INTO events (category_id, title, description, event_date, duration,
                                  capacity, ticket_price, created_by, status)
                VALUES (%s, %s, %s, %s, %s::interval, %s, %s, %s, %s)
                RETURNING event_id, title, description, event_date, duration, capacity, ticket_price, status
                """,
                (event.category_id, event.title, event.description, event.event_date,
                 f"{event.duration} minutes", total_capacity, min_price,
                 current_user["user_id"], event.status)
            )
            new_event = cur.fetchone()
            event_id = new_event["event_id"]
            print(f"Event inserted successfully: {dict(new_event)}")
            
            # Insert zone configurations
            for zone in event.zones:
                cur.execute(
                    """
                    INSERT INTO event_zones (event_id, zone_id, available_seats, zone_price)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (event_id, zone.zone_id, zone.available_seats, zone.zone_price)
                )
            
            print(f"Zone configurations inserted for event {event_id}")
            
            # Log the action
            log_user_action(
                current_user["user_id"],
                "create_event",
                {
                    "event_id": event_id,
                    "title": event.title,
                    "event_date": event.event_date.isoformat(),
                    "zones_count": len(event.zones),
                    "total_capacity": total_capacity,
                    "status": event.status
                }
            )
            
            result = {
                **dict(new_event),
                "booked_seats": 0,
                "category_name": None,
                "zones": [zone.dict() for zone in event.zones],
                "message": "Мероприятие успешно создано"
            }
            print(f"Returning result: {result}")
            return result
            
    except Exception as e:
        print(f"Error creating event: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/{event_id}")
async def get_event(event_id: int):
    """Get a specific event by ID with zone information"""
    try:
        with get_db_cursor() as cur:
            cur.execute(
                """
                SELECT e.*, c.name as category_name,
                       COALESCE(
                           (SELECT COUNT(*) FROM bookings b 
                            WHERE b.event_id = e.event_id AND b.status = 'confirmed'), 
                           0
                       ) as booked_seats
                FROM events e
                LEFT JOIN event_categories c ON e.category_id = c.category_id
                WHERE e.event_id = %s
                """,
                (event_id,)
            )
            event = cur.fetchone()
            if not event:
                raise HTTPException(status_code=404, detail="Мероприятие не найдено")
                
            event_dict = dict(event)
            event_dict['booked_seats'] = int(event_dict.get('booked_seats', 0))
            
            # Get zone configurations
            cur.execute("""
                SELECT ez.*, z.name as zone_name, z.description as zone_description
                FROM event_zones ez
                JOIN club_zones z ON ez.zone_id = z.zone_id
                WHERE ez.event_id = %s
                ORDER BY z.name
            """, (event_id,))
            
            zones = cur.fetchall()
            event_dict['zones'] = [dict(zone) for zone in zones]
            
            return event_dict
    except Exception as e:
        print(f"Error getting event: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

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
            # Check if event exists
            cur.execute("SELECT * FROM events WHERE event_id = %s", (event_id,))
            existing_event = cur.fetchone()
            if not existing_event:
                raise HTTPException(status_code=404, detail="Мероприятие не найдено")
            
            # If trying to update date, ensure it's in the future (unless admin)
            if event.event_date and current_user.get("role") != "admin":
                if event.event_date <= datetime.now():
                    raise HTTPException(status_code=400, detail="Дата мероприятия должна быть в будущем")
                
            update_fields = []
            params = []
            
            # Handle basic event fields
            for field, value in event.dict(exclude_unset=True, exclude={'zones'}).items():
                if value is not None:
                    if field == "duration":
                        update_fields.append(f"{field} = %s::interval")
                        params.append(f"{value} minutes")
                    else:
                        update_fields.append(f"{field} = %s")
                        params.append(value)
            
            # Update basic event fields if any
            if update_fields:
                params.append(event_id)
                query = f"""
                    UPDATE events
                    SET {", ".join(update_fields)}
                    WHERE event_id = %s
                """
                cur.execute(query, params)
            
            # Handle zones update if provided
            if event.zones is not None:
                # Validate zones exist
                zone_ids = [zone.zone_id for zone in event.zones]
                cur.execute(
                    "SELECT zone_id FROM club_zones WHERE zone_id = ANY(%s)",
                    (zone_ids,)
                )
                existing_zones = [row['zone_id'] for row in cur.fetchall()]
                
                missing_zones = set(zone_ids) - set(existing_zones)
                if missing_zones:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Зоны не найдены: {missing_zones}"
                    )
                
                # Delete existing zone configurations
                cur.execute("DELETE FROM event_zones WHERE event_id = %s", (event_id,))
                
                # Insert new zone configurations
                min_price = float('inf')
                total_capacity = 0
                
                for zone in event.zones:
                    cur.execute(
                        """
                        INSERT INTO event_zones (event_id, zone_id, available_seats, zone_price)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (event_id, zone.zone_id, zone.available_seats, zone.zone_price)
                    )
                    min_price = min(min_price, zone.zone_price)
                    total_capacity += zone.available_seats
                
                # Update event capacity and price
                cur.execute(
                    "UPDATE events SET capacity = %s, ticket_price = %s WHERE event_id = %s",
                    (total_capacity, min_price, event_id)
                )
            
            # Get updated event data
            cur.execute(
                """
                SELECT e.*, c.name as category_name
                FROM events e
                LEFT JOIN event_categories c ON e.category_id = c.category_id
                WHERE e.event_id = %s
                """,
                (event_id,)
            )
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
            
            return dict(updated_event)
    except Exception as e:
        print(f"Error updating event: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.patch("/{event_id}/status")
async def update_event_status(
    event_id: int,
    status_update: EventStatusUpdate,
    current_user: dict = Depends(verify_csrf())
):
    """Update event status (planned -> active -> cancelled)"""
    # Check if user has admin or moderator role
    if not current_user.get("role") or current_user["role"] not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав для изменения статуса мероприятий")
    
    try:
        with get_db_cursor(commit=True) as cur:
            # Check if event exists
            cur.execute("SELECT * FROM events WHERE event_id = %s", (event_id,))
            event = cur.fetchone()
            if not event:
                raise HTTPException(status_code=404, detail="Мероприятие не найдено")
            
            old_status = event['status']
            new_status = status_update.status
            
            # Validate status transition
            valid_transitions = {
                'planned': ['active', 'cancelled'],
                'active': ['cancelled'],
                'cancelled': []  # Cannot change from cancelled
            }
            
            if new_status not in valid_transitions.get(old_status, []):
                raise HTTPException(
                    status_code=400, 
                    detail=f"Невозможно изменить статус с '{old_status}' на '{new_status}'"
                )
            
            # Update status
            cur.execute(
                "UPDATE events SET status = %s WHERE event_id = %s",
                (new_status, event_id)
            )
            
            # If cancelling event, cancel all pending bookings
            if new_status == 'cancelled':
                cur.execute(
                    "UPDATE bookings SET status = 'cancelled' WHERE event_id = %s AND status = 'pending'",
                    (event_id,)
                )
                cancelled_bookings = cur.rowcount
                
                # Refund confirmed bookings
                cur.execute(
                    """
                    UPDATE transactions 
                    SET status = 'refunded' 
                    WHERE booking_id IN (
                        SELECT booking_id FROM bookings 
                        WHERE event_id = %s AND status = 'confirmed'
                    ) AND status = 'completed'
                    """,
                    (event_id,)
                )
                refunded_transactions = cur.rowcount
                
                # Mark confirmed bookings as cancelled
                cur.execute(
                    "UPDATE bookings SET status = 'cancelled' WHERE event_id = %s AND status = 'confirmed'",
                    (event_id,)
                )
            
            # Log the action
            log_details = {
                "event_id": event_id,
                "old_status": old_status,
                "new_status": new_status,
                "event_title": event['title']
            }
            
            if new_status == 'cancelled':
                log_details.update({
                    "cancelled_bookings": cancelled_bookings,
                    "refunded_transactions": refunded_transactions
                })
            
            log_user_action(
                current_user["user_id"],
                "update_event_status",
                log_details
            )
            
            return {
                "message": f"Статус мероприятия изменен с '{old_status}' на '{new_status}'",
                "event_id": event_id,
                "old_status": old_status,
                "new_status": new_status
            }
            
    except Exception as e:
        print(f"Error updating event status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/{event_id}/seats")
async def get_event_seats(event_id: int, zone_id: Optional[int] = None):
    """Get available seats for an event, optionally filtered by zone"""
    try:
        with get_db_cursor() as cur:
            # Check if event exists
            cur.execute("SELECT * FROM events WHERE event_id = %s", (event_id,))
            event = cur.fetchone()
            if not event:
                raise HTTPException(status_code=404, detail="Мероприятие не найдено")
            
            # Check if event is bookable (active status and future date)
            if event['status'] != 'active':
                raise HTTPException(
                    status_code=400, 
                    detail=f"Бронирование недоступно. Статус мероприятия: {event['status']}"
                )
            
            if event['event_date'] <= datetime.now():
                raise HTTPException(
                    status_code=400, 
                    detail="Мероприятие уже началось"
                )
                
            # Get seats for the zone with event zone pricing
            query = """
                SELECT s.seat_id, s.seat_number, s.zone_id, z.name as zone_name,
                       ez.zone_price,
                       CASE WHEN b.booking_id IS NOT NULL THEN true ELSE false END as is_booked
                FROM seats s
                JOIN club_zones z ON s.zone_id = z.zone_id
                JOIN event_zones ez ON s.zone_id = ez.zone_id AND ez.event_id = %s
                LEFT JOIN bookings b ON s.seat_id = b.seat_id 
                    AND b.event_id = %s 
                    AND b.status IN ('confirmed', 'pending')
            """
            params = [event_id, event_id]
            
            if zone_id:
                query += " WHERE s.zone_id = %s"
                params.append(zone_id)
                
            query += " ORDER BY s.seat_number"
            
            cur.execute(query, params)
            seats = cur.fetchall()
            
            return {"seats": [dict(seat) for seat in seats]}
    except Exception as e:
        print(f"Error getting seats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

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
            # Check if event exists
            cur.execute("SELECT * FROM events WHERE event_id = %s", (event_id,))
            event = cur.fetchone()
            if not event:
                raise HTTPException(status_code=404, detail="Мероприятие не найдено")
            
            # Check if event has bookings
            cur.execute(
                "SELECT COUNT(*) as booking_count FROM bookings WHERE event_id = %s AND status IN ('confirmed', 'pending')",
                (event_id,)
            )
            booking_count = cur.fetchone()["booking_count"]
            
            if booking_count > 0:
                raise HTTPException(
                    status_code=400, 
                    detail="Невозможно удалить мероприятие с существующими бронированиями"
                )
                
            # Delete event (cascade will delete event_zones)
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
        print(f"Error deleting event: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/{event_id}/statistics")
async def get_event_statistics(
    event_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Get detailed statistics for an event"""
    # Check if user has admin or moderator role
    if not current_user.get("role") or current_user["role"] not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав для просмотра статистики")
    
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
                    COUNT(t.transaction_id) as paid_transactions,
                    COALESCE(AVG(t.amount), 0) as average_ticket_price
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
                    ez.available_seats as zone_capacity,
                    ez.zone_price,
                    COUNT(b.booking_id) as bookings_count,
                    COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN ez.zone_price ELSE 0 END), 0) as zone_revenue
                FROM event_zones ez
                JOIN club_zones z ON ez.zone_id = z.zone_id
                LEFT JOIN seats s ON z.zone_id = s.zone_id
                LEFT JOIN bookings b ON s.seat_id = b.seat_id AND b.event_id = %s AND b.status = 'confirmed'
                WHERE ez.event_id = %s
                GROUP BY z.zone_id, z.name, ez.available_seats, ez.zone_price
                ORDER BY zone_revenue DESC
                """,
                (event_id, event_id)
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
        print(f"Error getting event statistics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")