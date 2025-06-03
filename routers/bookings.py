from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import get_db_cursor
from utils.auth import get_current_user, verifier, SessionData
from utils.helpers import log_user_action, check_seat_availability

router = APIRouter()

class BookingCreate(BaseModel):
    event_id: int
    seat_id: int

class BookingUpdate(BaseModel):
    status: str

@router.post("/", status_code=201)
async def create_booking(
    booking: BookingCreate,
    session: SessionData = Depends(verifier)
):
    """Create a new booking"""
    with get_db_cursor(commit=True) as cur:
        # Check if event exists and is available for booking
        cur.execute(
            """
            SELECT e.*, ez.zone_id, ez.available_seats, ez.zone_price
            FROM events e
            JOIN event_zones ez ON e.event_id = ez.event_id
            JOIN seats s ON s.zone_id = ez.zone_id
            WHERE e.event_id = %s AND s.seat_id = %s
            """,
            (booking.event_id, booking.seat_id)
        )
        event = cur.fetchone()
        
        if not event:
            raise HTTPException(status_code=404, detail="Event or seat not found")
        
        if event["status"] != "published":
            raise HTTPException(status_code=400, detail="Event is not available for booking")
        
        if event["event_date"] <= datetime.now():
            raise HTTPException(status_code=400, detail="Event has already started or ended")
        
        # Check if seat is available
        if not check_seat_availability(booking.event_id, booking.seat_id):
            raise HTTPException(status_code=400, detail="Seat is already booked")
        
        # Create booking
        cur.execute(
            """
            INSERT INTO bookings (event_id, user_id, seat_id, status, price)
            VALUES (%s, %s, %s, 'pending', %s)
            RETURNING booking_id, event_id, user_id, seat_id, status, created_at, price
            """,
            (booking.event_id, session.user_id, booking.seat_id, event["zone_price"])
        )
        new_booking = cur.fetchone()
        
        # Log the action
        log_user_action(
            session.user_id,
            "create_booking",
            {
                "booking_id": new_booking["booking_id"],
                "event_id": booking.event_id,
                "seat_id": booking.seat_id
            }
        )
        
        return new_booking

@router.get("/my")
async def get_my_bookings(session: SessionData = Depends(verifier)):
    """Get user's bookings"""
    with get_db_cursor() as cur:
        cur.execute(
            """
            SELECT b.*, e.title as event_title, e.event_date,
                   s.seat_number, z.name as zone_name
            FROM bookings b
            JOIN events e ON b.event_id = e.event_id
            JOIN seats s ON b.seat_id = s.seat_id
            JOIN zones z ON s.zone_id = z.zone_id
            WHERE b.user_id = %s
            ORDER BY e.event_date DESC
            """,
            (session.user_id,)
        )
        bookings = cur.fetchall()
        return bookings

@router.put("/{booking_id}")
async def update_booking(
    booking_id: int,
    booking_update: BookingUpdate,
    session: SessionData = Depends(verifier)
):
    """Update booking status"""
    with get_db_cursor(commit=True) as cur:
        # Check if booking exists and belongs to user
        cur.execute(
            """
            SELECT b.*, e.status as event_status
            FROM bookings b
            JOIN events e ON b.event_id = e.event_id
            WHERE b.booking_id = %s
            """,
            (booking_id,)
        )
        booking = cur.fetchone()
        
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        if booking["user_id"] != session.user_id and session.role not in ["admin", "moderator"]:
            raise HTTPException(status_code=403, detail="Not authorized to update this booking")
        
        if booking["event_status"] == "cancelled":
            raise HTTPException(status_code=400, detail="Cannot update booking for cancelled event")
        
        # Update booking status
        cur.execute(
            """
            UPDATE bookings
            SET status = %s
            WHERE booking_id = %s
            RETURNING *
            """,
            (booking_update.status, booking_id)
        )
        updated_booking = cur.fetchone()
        
        # Log the action
        log_user_action(
            session.user_id,
            "update_booking",
            {
                "booking_id": booking_id,
                "new_status": booking_update.status
            }
        )
        
        return updated_booking

@router.delete("/{booking_id}")
async def cancel_booking(
    booking_id: int,
    session: SessionData = Depends(verifier)
):
    """Cancel booking"""
    with get_db_cursor(commit=True) as cur:
        # Check if booking exists and belongs to user
        cur.execute(
            """
            SELECT b.*, e.event_date, e.status as event_status
            FROM bookings b
            JOIN events e ON b.event_id = e.event_id
            WHERE b.booking_id = %s
            """,
            (booking_id,)
        )
        booking = cur.fetchone()
        
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        if booking["user_id"] != session.user_id and session.role not in ["admin", "moderator"]:
            raise HTTPException(status_code=403, detail="Not authorized to cancel this booking")
        
        if booking["event_date"] <= datetime.now():
            raise HTTPException(status_code=400, detail="Cannot cancel booking for past event")
        
        if booking["event_status"] == "cancelled":
            raise HTTPException(status_code=400, detail="Event is already cancelled")
        
        # Cancel booking
        cur.execute(
            """
            UPDATE bookings
            SET status = 'cancelled'
            WHERE booking_id = %s
            RETURNING *
            """,
            (booking_id,)
        )
        cancelled_booking = cur.fetchone()
        
        # Log the action
        log_user_action(
            session.user_id,
            "cancel_booking",
            {"booking_id": booking_id}
        )
        
        return cancelled_booking