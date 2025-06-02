from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
from database import get_db_cursor
from utils.auth import get_current_user, check_role

router = APIRouter()

class EventCreate(BaseModel):
    category_id: int
    title: str
    description: str
    event_date: datetime
    duration: int  # in minutes
    capacity: int
    ticket_price: float

class EventUpdate(BaseModel):
    title: Optional[str]
    description: Optional[str]
    event_date: Optional[datetime]
    duration: Optional[int]
    capacity: Optional[int]
    ticket_price: Optional[float]

@router.get("/")
async def get_events(
    category: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None
):
    with get_db_cursor() as cur:
        # First, check if we have any events at all
        cur.execute("SELECT COUNT(*) as count FROM events")
        if cur.fetchone()["count"] == 0:
            return []

        query = """
            SELECT e.*, c.name as category_name,
                   (SELECT COUNT(*) FROM bookings b WHERE b.event_id = e.event_id) as booked_seats
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

@router.post("/", status_code=201)
async def create_event(
    event: EventCreate,
    current_user: dict = Depends(check_role(["admin", "moderator"]))
):
    with get_db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO events (category_id, title, description, event_date, duration,
                              capacity, ticket_price, created_by, status)
            VALUES (%s, %s, %s, %s, %s::interval, %s, %s, %s, 'planned')
            RETURNING event_id
            """,
            (event.category_id, event.title, event.description, event.event_date,
             f"{event.duration} minutes", event.capacity, event.ticket_price,
             current_user["user_id"])
        )
        event_id = cur.fetchone()["event_id"]
        return {"event_id": event_id, "message": "Event created successfully"}

@router.put("/{event_id}")
async def update_event(
    event_id: int,
    event: EventUpdate,
    current_user: dict = Depends(check_role(["admin", "moderator"]))
):
    with get_db_cursor(commit=True) as cur:
        # Check if event exists
        cur.execute("SELECT * FROM events WHERE event_id = %s", (event_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Event not found")
            
        # Build update query
        update_fields = []
        params = []
        for field, value in event.dict(exclude_unset=True).items():
            if field == "duration" and value is not None:
                update_fields.append(f"{field} = %s::interval")
                params.append(f"{value} minutes")
            else:
                update_fields.append(f"{field} = %s")
                params.append(value)
        
        if not update_fields:
            return {"message": "No fields to update"}
            
        params.append(event_id)
        query = f"""
            UPDATE events
            SET {", ".join(update_fields)}
            WHERE event_id = %s
        """
        cur.execute(query, params)
        
        return {"message": "Event updated successfully"}

@router.get("/{event_id}")
async def get_event(event_id: int):
    with get_db_cursor() as cur:
        cur.execute(
            """
            SELECT e.*, c.name as category_name,
                   (SELECT COUNT(*) FROM bookings b WHERE b.event_id = e.event_id) as booked_seats,
                   (SELECT json_agg(json_build_object(
                       'zone_id', z.zone_id,
                       'zone_name', z.name,
                       'available_seats', z.capacity - COALESCE(b.booked_count, 0)
                   ))
                    FROM club_zones z
                    LEFT JOIN (
                        SELECT s.zone_id, COUNT(*) as booked_count
                        FROM bookings b
                        JOIN seats s ON b.seat_id = s.seat_id
                        WHERE b.event_id = e.event_id
                        GROUP BY s.zone_id
                    ) b ON z.zone_id = b.zone_id
                   ) as zones
            FROM events e
            LEFT JOIN event_categories c ON e.category_id = c.category_id
            WHERE e.event_id = %s
            """,
            (event_id,)
        )
        event = cur.fetchone()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        return event

@router.delete("/{event_id}")
async def delete_event(
    event_id: int,
    current_user: dict = Depends(check_role(["admin", "moderator"]))
):
    with get_db_cursor(commit=True) as cur:
        # Check if event exists and has no bookings
        cur.execute(
            """
            SELECT e.*, COUNT(b.booking_id) as booking_count
            FROM events e
            LEFT JOIN bookings b ON e.event_id = b.event_id
            WHERE e.event_id = %s
            GROUP BY e.event_id
            """,
            (event_id,)
        )
        event = cur.fetchone()
        
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        if event["booking_count"] > 0:
            raise HTTPException(status_code=400, detail="Cannot delete event with existing bookings")
            
        cur.execute("DELETE FROM events WHERE event_id = %s", (event_id,))
        return {"message": "Event deleted successfully"} 