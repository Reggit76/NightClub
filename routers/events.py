# routers/events.py - Enhanced with zone support and status management
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel, validator
from typing import Optional, List
from datetime import datetime, timedelta
from database import get_db_cursor
from utils.auth import get_current_user, check_role, verifier, SessionData
from utils.helpers import log_user_action, log_api_request
from fastapi.responses import JSONResponse
import traceback
import pytz

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
    category_id: int
    title: str
    description: str
    event_date: datetime
    duration: int  # in minutes
    zones: List[EventZoneConfig]
    status: str = "draft"  # draft, published, cancelled

    @validator('event_date')
    def validate_event_date(cls, v):
        # Ensure the datetime is timezone-aware
        if v.tzinfo is None:
            v = v.replace(tzinfo=pytz.UTC)
        return v

class EventUpdate(BaseModel):
    category_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    event_date: Optional[datetime] = None
    duration: Optional[int] = None  # in minutes
    zones: Optional[List[EventZoneConfig]] = None
    status: Optional[str] = None

class EventStatusUpdate(BaseModel):
    status: str
    
    @validator('status')
    def validate_status(cls, v):
        allowed_statuses = ['planned', 'active', 'cancelled']
        if v not in allowed_statuses:
            raise ValueError(f'Статус должен быть одним из: {", ".join(allowed_statuses)}')
        return v

@router.get("/categories")
async def get_categories(request: Request):
    """Get all event categories"""
    try:
        log_api_request("/events/categories", "GET")
        
        with get_db_cursor() as cur:
            cur.execute("SELECT * FROM event_categories ORDER BY name")
            categories = cur.fetchall()
            result = [dict(cat) for cat in categories]
            
            log_api_request("/events/categories", "GET", body={"count": len(result)})
            return result
    except Exception as e:
        log_api_request("/events/categories", "GET", error=e)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/zones")
async def get_zones(request: Request):
    """Get all available zones with seat information"""
    try:
        log_api_request("/events/zones", "GET")
        
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
            result = [dict(zone) for zone in zones]
            
            log_api_request("/events/zones", "GET", body={"count": len(result)})
            return result
    except Exception as e:
        log_api_request("/events/zones", "GET", error=e)
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/")
async def list_events(
    request: Request,
    category: Optional[int] = None,
    status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    page: int = Query(1, gt=0),
    limit: int = Query(10, gt=0, le=100)
):
    """List events with optional filters"""
    try:
        params = {
            "category": category,
            "status": status,
            "date_from": date_from,
            "date_to": date_to,
            "page": page,
            "limit": limit
        }
        log_api_request("/events/", "GET", params=params)
        
        with get_db_cursor() as cur:
            # Build query conditions
            conditions = []
            query_params = []
            
            if category:
                conditions.append("e.category_id = %s")
                query_params.append(category)
            
            if status:
                conditions.append("e.status = %s")
                query_params.append(status)
            
            if date_from:
                conditions.append("e.event_date >= %s")
                query_params.append(date_from)
            
            if date_to:
                conditions.append("e.event_date <= %s")
                query_params.append(date_to)
            
            # Calculate offset
            offset = (page - 1) * limit
            query_params.extend([limit, offset])
            
            # Build WHERE clause
            where_clause = " AND ".join(conditions) if conditions else "1=1"
            
            try:
                # Get total count
                count_query = f"""
                    SELECT COUNT(*) as total
                    FROM events e
                    WHERE {where_clause}
                """
                cur.execute(count_query, query_params[:-2] if query_params else None)
                total = cur.fetchone()["total"]
                
                # Get paginated events with zone info
                query = f"""
                    SELECT 
                        e.*,
                        json_agg(
                            json_build_object(
                                'zone_id', ez.zone_id,
                                'zone_name', z.name,
                                'available_seats', ez.available_seats,
                                'zone_price', ez.zone_price
                            )
                        ) as zones
                    FROM events e
                    LEFT JOIN event_zones ez ON e.event_id = ez.event_id
                    LEFT JOIN club_zones z ON ez.zone_id = z.zone_id
                    WHERE {where_clause}
                    GROUP BY e.event_id
                    ORDER BY e.event_date ASC
                    LIMIT %s OFFSET %s
                """
                cur.execute(query, query_params)
                events = cur.fetchall()
                
                result = {
                    "total": total,
                    "page": page,
                    "limit": limit,
                    "events": events
                }
                
                log_api_request("/events/", "GET", params=params, body={
                    "total": total,
                    "returned": len(events),
                    "page": page
                })
                
                return result
                
            except Exception as e:
                log_api_request("/events/", "GET", params=params, error=e)
                raise HTTPException(
                    status_code=500,
                    detail=f"Database query error: {str(e)}\nQuery: {query}\nParams: {query_params}"
                )
                
    except Exception as e:
        log_api_request("/events/", "GET", params=params, error=e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list events: {str(e)}\n{traceback.format_exc()}"
        )

@router.post("/", status_code=201)
async def create_event(
    request: Request,
    event: EventCreate,
    session: SessionData = Depends(verifier)
):
    """Create a new event with zone configuration"""
    try:
        log_api_request("/events/", "POST", 
                       body=event,
                       user_id=session.user_id,
                       session_id=str(getattr(request.state, "session_id", None)))
        
        with get_db_cursor(commit=True) as cur:
            # Validate event date
            now = datetime.now(pytz.UTC)
            if event.event_date <= now:
                raise HTTPException(
                    status_code=400,
                    detail="Event date must be in the future"
                )
            
            # Validate duration
            if event.duration <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="Duration must be positive"
                )
            
            # Validate zones
            if not event.zones:
                raise HTTPException(
                    status_code=400,
                    detail="At least one zone configuration is required"
                )
            
            try:
                # Verify all zones exist
                zone_ids = [z.zone_id for z in event.zones]
                cur.execute(
                    "SELECT zone_id FROM club_zones WHERE zone_id = ANY(%s)",
                    (zone_ids,)
                )
                existing_zones = {row["zone_id"] for row in cur.fetchall()}
                
                invalid_zones = set(zone_ids) - existing_zones
                if invalid_zones:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid zone IDs: {invalid_zones}"
                    )
                
                # Calculate total capacity and minimum price
                total_capacity = sum(z.available_seats for z in event.zones)
                min_price = min(z.zone_price for z in event.zones)
                
                # Insert event
                try:
                    cur.execute(
                        """
                        INSERT INTO events (category_id, title, description, event_date, duration,
                                          capacity, ticket_price, created_by, status)
                        VALUES (%s, %s, %s, %s, %s::interval, %s, %s, %s, %s)
                        RETURNING event_id, title, description, event_date, duration, capacity, 
                                  ticket_price, status
                        """,
                        (event.category_id, event.title, event.description, event.event_date,
                         f"{event.duration} minutes", total_capacity, min_price,
                         session.user_id, event.status)
                    )
                    new_event = cur.fetchone()
                    event_id = new_event["event_id"]
                    
                    # Insert zone configurations
                    for zone in event.zones:
                        cur.execute(
                            """
                            INSERT INTO event_zones (event_id, zone_id, available_seats, zone_price)
                            VALUES (%s, %s, %s, %s)
                            """,
                            (event_id, zone.zone_id, zone.available_seats, zone.zone_price)
                        )
                    
                    log_user_action(
                        session.user_id,
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
                    
                    log_api_request("/events/", "POST", 
                                  user_id=session.user_id,
                                  body={"event_id": event_id, "status": "success"})
                    
                    return new_event
                    
                except Exception as e:
                    log_api_request("/events/", "POST", 
                                  user_id=session.user_id,
                                  error=e)
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to create event: {str(e)}"
                    )
                    
            except HTTPException:
                raise
            except Exception as e:
                log_api_request("/events/", "POST", 
                              user_id=session.user_id,
                              error=e)
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to validate zones: {str(e)}"
                )
                
    except Exception as e:
        log_api_request("/events/", "POST", 
                       user_id=getattr(session, "user_id", None),
                       error=e)
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create event: {str(e)}\n{traceback.format_exc()}"
        )

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
    session: SessionData = Depends(verifier)
):
    """Update an existing event"""
    with get_db_cursor(commit=True) as cur:
        # Check if event exists and user has permission
        cur.execute(
            """
            SELECT e.*, 
                   CASE WHEN e.created_by = %s THEN true
                        WHEN %s = 'admin' THEN true
                        ELSE false
                   END as can_edit
            FROM events e
            WHERE e.event_id = %s
            """,
            (session.user_id, session.role, event_id)
        )
        db_event = cur.fetchone()
        
        if not db_event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        if not db_event["can_edit"]:
            raise HTTPException(status_code=403, detail="Not authorized to edit this event")
        
        # Build update query
        update_fields = []
        params = []
        
        if event.category_id is not None:
            update_fields.append("category_id = %s")
            params.append(event.category_id)
        
        if event.title is not None:
            update_fields.append("title = %s")
            params.append(event.title)
        
        if event.description is not None:
            update_fields.append("description = %s")
            params.append(event.description)
        
        if event.event_date is not None:
            if event.event_date <= datetime.now():
                raise HTTPException(
                    status_code=400,
                    detail="Event date must be in the future"
                )
            update_fields.append("event_date = %s")
            params.append(event.event_date)
        
        if event.duration is not None:
            if event.duration <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="Duration must be positive"
                )
            update_fields.append("duration = %s::interval")
            params.append(f"{event.duration} minutes")
        
        if event.status is not None:
            if event.status not in ["draft", "published", "cancelled"]:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid status"
                )
            update_fields.append("status = %s")
            params.append(event.status)
        
        # Update zones if provided
        if event.zones is not None:
            # Validate zones
            if not event.zones:
                raise HTTPException(
                    status_code=400,
                    detail="At least one zone configuration is required"
                )
            
            # Verify all zones exist
            zone_ids = [z.zone_id for z in event.zones]
            cur.execute(
                "SELECT zone_id FROM club_zones WHERE zone_id = ANY(%s)",
                (zone_ids,)
            )
            existing_zones = {row["zone_id"] for row in cur.fetchall()}
            
            invalid_zones = set(zone_ids) - existing_zones
            if invalid_zones:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid zone IDs: {invalid_zones}"
                )
            
            # Calculate new capacity and minimum price
            total_capacity = sum(z.available_seats for z in event.zones)
            min_price = min(z.zone_price for z in event.zones)
            
            update_fields.extend(["capacity = %s", "ticket_price = %s"])
            params.extend([total_capacity, min_price])
            
            # Update zone configurations
            cur.execute("DELETE FROM event_zones WHERE event_id = %s", (event_id,))
            for zone in event.zones:
                cur.execute(
                    """
                    INSERT INTO event_zones (event_id, zone_id, available_seats, zone_price)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (event_id, zone.zone_id, zone.available_seats, zone.zone_price)
                )
        
        if update_fields:
            # Add event_id to params
            params.append(event_id)
            
            # Update event
            query = f"""
                UPDATE events
                SET {", ".join(update_fields)}
                WHERE event_id = %s
                RETURNING *
            """
            cur.execute(query, params)
            updated_event = cur.fetchone()
            
            # Log the action
            log_user_action(
                session.user_id,
                "update_event",
                {
                    "event_id": event_id,
                    "updated_fields": [f.split(" = ")[0] for f in update_fields]
                }
            )
            
            return updated_event
        
        return db_event

@router.patch("/{event_id}/status")
async def update_event_status(
    event_id: int,
    status_update: EventStatusUpdate,
    session: SessionData = Depends(verifier)
):
    """Update event status (planned -> active -> cancelled)"""
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
            session.user_id,
            "update_event_status",
            log_details
        )
        
        return {
            "message": f"Статус мероприятия изменен с '{old_status}' на '{new_status}'",
            "event_id": event_id,
            "old_status": old_status,
            "new_status": new_status
        }

# Fixed routers/events.py with better error handling for seats endpoint

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
            if event['status'] not in ['planned', 'active']:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Бронирование недоступно. Статус мероприятия: {event['status']}"
                )
            
            if event['event_date'] <= datetime.now():
                raise HTTPException(
                    status_code=400, 
                    detail="Мероприятие уже началось"
                )
            
            # Improved query with better error handling
            # First, check if event has zone configurations
            cur.execute("""
                SELECT COUNT(*) as zone_count
                FROM event_zones ez
                WHERE ez.event_id = %s
            """, (event_id,))
            
            zone_config_count = cur.fetchone()["zone_count"]
            
            if zone_config_count == 0:
                # No zone configuration exists for this event
                # Create default zone configuration
                log_api_request(f"/events/{event_id}/seats", "GET", 
                               error=Exception("No zone configuration found, creating default"))
                
                # Get all available zones
                cur.execute("SELECT zone_id, capacity FROM club_zones")
                all_zones = cur.fetchall()
                
                if not all_zones:
                    raise HTTPException(
                        status_code=500,
                        detail="Системная ошибка: нет настроенных зон"
                    )
                
                # Create default event_zones entries
                for zone in all_zones:
                    default_price = 1000.0  # Default price
                    available_seats = min(zone["capacity"], 50)  # Max 50 seats per zone by default
                    
                    try:
                        cur.execute("""
                            INSERT INTO event_zones (event_id, zone_id, available_seats, zone_price)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (event_id, zone_id) DO NOTHING
                        """, (event_id, zone["zone_id"], available_seats, default_price))
                    except Exception as e:
                        logger.error(f"Failed to create default zone config: {e}")
                        continue
                
                # Commit the changes
                cur.connection.commit()
            
            # Now get seats with improved query
            if zone_id:
                # Specific zone requested
                query = """
                    SELECT s.seat_id, s.seat_number, s.zone_id, z.name as zone_name,
                           COALESCE(ez.zone_price, %s) as zone_price,
                           CASE WHEN b.booking_id IS NOT NULL THEN true ELSE false END as is_booked
                    FROM seats s
                    JOIN club_zones z ON s.zone_id = z.zone_id
                    LEFT JOIN event_zones ez ON s.zone_id = ez.zone_id AND ez.event_id = %s
                    LEFT JOIN bookings b ON s.seat_id = b.seat_id 
                        AND b.event_id = %s 
                        AND b.status IN ('confirmed', 'pending')
                    WHERE s.zone_id = %s
                    ORDER BY s.seat_number
                """
                params = [event["ticket_price"] or 1000.0, event_id, event_id, zone_id]
            else:
                # All zones
                query = """
                    SELECT s.seat_id, s.seat_number, s.zone_id, z.name as zone_name,
                           COALESCE(ez.zone_price, %s) as zone_price,
                           CASE WHEN b.booking_id IS NOT NULL THEN true ELSE false END as is_booked
                    FROM seats s
                    JOIN club_zones z ON s.zone_id = z.zone_id
                    LEFT JOIN event_zones ez ON s.zone_id = ez.zone_id AND ez.event_id = %s
                    LEFT JOIN bookings b ON s.seat_id = b.seat_id 
                        AND b.event_id = %s 
                        AND b.status IN ('confirmed', 'pending')
                    ORDER BY z.zone_id, s.seat_number
                """
                params = [event["ticket_price"] or 1000.0, event_id, event_id]
            
            try:
                cur.execute(query, params)
                seats = cur.fetchall()
                
                log_api_request(f"/events/{event_id}/seats", "GET", 
                               params={"zone_id": zone_id}, 
                               body={"seats_found": len(seats)})
                
                return {"seats": [dict(seat) for seat in seats]}
                
            except Exception as db_error:
                logger.error(f"Database error in get_event_seats: {str(db_error)}")
                logger.error(f"Query: {query}")
                logger.error(f"Params: {params}")
                
                # Try a simpler fallback query
                try:
                    fallback_query = """
                        SELECT s.seat_id, s.seat_number, s.zone_id, z.name as zone_name,
                               %s as zone_price,
                               false as is_booked
                        FROM seats s
                        JOIN club_zones z ON s.zone_id = z.zone_id
                        WHERE s.zone_id = COALESCE(%s, s.zone_id)
                        ORDER BY s.seat_number
                        LIMIT 100
                    """
                    fallback_params = [event["ticket_price"] or 1000.0, zone_id]
                    
                    cur.execute(fallback_query, fallback_params)
                    fallback_seats = cur.fetchall()
                    
                    logger.warning(f"Used fallback query, found {len(fallback_seats)} seats")
                    return {"seats": [dict(seat) for seat in fallback_seats]}
                    
                except Exception as fallback_error:
                    logger.error(f"Fallback query also failed: {str(fallback_error)}")
                    raise HTTPException(
                        status_code=500, 
                        detail=f"Ошибка базы данных при загрузке мест: {str(db_error)}"
                    )
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_event_seats: {str(e)}")
        log_api_request(f"/events/{event_id}/seats", "GET", 
                       params={"zone_id": zone_id}, 
                       error=e)
        raise HTTPException(
            status_code=500, 
            detail=f"Неожиданная ошибка: {str(e)}"
        )

@router.delete("/{event_id}")
async def delete_event(
    event_id: int,
    session: SessionData = Depends(verifier)
):
    """Delete an event"""
    with get_db_cursor(commit=True) as cur:
        # Check if event exists and user has permission
        cur.execute(
            """
            SELECT e.*, 
                   CASE WHEN e.created_by = %s THEN true
                        WHEN %s = 'admin' THEN true
                        ELSE false
                   END as can_delete
            FROM events e
            WHERE e.event_id = %s
            """,
            (session.user_id, session.role, event_id)
        )
        event = cur.fetchone()
        
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        if not event["can_delete"]:
            raise HTTPException(status_code=403, detail="Not authorized to delete this event")
        
        # Check if event has any bookings
        cur.execute(
            "SELECT COUNT(*) as booking_count FROM bookings WHERE event_id = %s",
            (event_id,)
        )
        booking_count = cur.fetchone()["booking_count"]
        
        if booking_count > 0:
            # Instead of deleting, mark as cancelled
            cur.execute(
                "UPDATE events SET status = 'cancelled' WHERE event_id = %s",
                (event_id,)
            )
            
            # Cancel all bookings
            cur.execute(
                "UPDATE bookings SET status = 'cancelled' WHERE event_id = %s",
                (event_id,)
            )
            
            # Log the action
            log_user_action(
                session.user_id,
                "cancel_event",
                {"event_id": event_id, "reason": "has_bookings"}
            )
            
            return {"message": "Event cancelled due to existing bookings"}
        
        # Delete event zones and event
        cur.execute("DELETE FROM event_zones WHERE event_id = %s", (event_id,))
        cur.execute("DELETE FROM events WHERE event_id = %s", (event_id,))
        
        # Log the action
        log_user_action(
            session.user_id,
            "delete_event",
            {"event_id": event_id}
        )
        
        return {"message": "Event deleted successfully"}

@router.get("/{event_id}/statistics")
async def get_event_statistics(
    event_id: int,
    session: SessionData = Depends(get_current_user)
):
    """Get detailed statistics for an event"""
    # Check if user has admin or moderator role
    if not session.role or session.role not in ["admin", "moderator"]:
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