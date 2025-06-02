from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from database import get_db_cursor
from utils.auth import get_current_user

router = APIRouter()

class BookingCreate(BaseModel):
    event_id: int
    seat_id: int

class PaymentSimulation(BaseModel):
    booking_id: int
    payment_method: str

@router.post("/", status_code=201)
async def create_booking(
    booking: BookingCreate,
    current_user: dict = Depends(get_current_user)
):
    with get_db_cursor(commit=True) as cur:
        # Check if event exists and has available capacity
        cur.execute(
            """
            SELECT e.*, 
                   (SELECT COUNT(*) FROM bookings b WHERE b.event_id = e.event_id) as booked_seats
            FROM events e
            WHERE e.event_id = %s
            """,
            (booking.event_id,)
        )
        event = cur.fetchone()
        
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
            
        if event["booked_seats"] >= event["capacity"]:
            raise HTTPException(status_code=400, detail="Event is fully booked")
            
        # Check if seat is available
        cur.execute(
            """
            SELECT s.*, b.booking_id
            FROM seats s
            LEFT JOIN bookings b ON s.seat_id = b.seat_id AND b.event_id = %s
            WHERE s.seat_id = %s
            """,
            (booking.event_id, booking.seat_id)
        )
        seat = cur.fetchone()
        
        if not seat:
            raise HTTPException(status_code=404, detail="Seat not found")
            
        if seat["booking_id"]:
            raise HTTPException(status_code=400, detail="Seat is already booked")
            
        # Create booking
        cur.execute(
            """
            INSERT INTO bookings (user_id, event_id, seat_id, status)
            VALUES (%s, %s, %s, 'pending')
            RETURNING booking_id
            """,
            (current_user["user_id"], booking.event_id, booking.seat_id)
        )
        booking_id = cur.fetchone()["booking_id"]
        
        return {
            "booking_id": booking_id,
            "message": "Booking created successfully, waiting for payment"
        }

@router.post("/pay")
async def simulate_payment(
    payment: PaymentSimulation,
    current_user: dict = Depends(get_current_user)
):
    with get_db_cursor(commit=True) as cur:
        # Check if booking exists and belongs to user
        cur.execute(
            """
            SELECT b.*, e.ticket_price
            FROM bookings b
            JOIN events e ON b.event_id = e.event_id
            WHERE b.booking_id = %s AND b.user_id = %s
            """,
            (payment.booking_id, current_user["user_id"])
        )
        booking = cur.fetchone()
        
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
            
        if booking["status"] != "pending":
            raise HTTPException(status_code=400, detail="Booking is not in pending status")
            
        # Simulate payment transaction
        cur.execute(
            """
            INSERT INTO transactions (booking_id, user_id, amount, payment_method, status)
            VALUES (%s, %s, %s, %s, 'completed')
            """,
            (payment.booking_id, current_user["user_id"], booking["ticket_price"],
             payment.payment_method)
        )
        
        # Update booking status
        cur.execute(
            """
            UPDATE bookings
            SET status = 'confirmed'
            WHERE booking_id = %s
            """,
            (payment.booking_id,)
        )
        
        return {"message": "Payment processed successfully"}

@router.get("/my-bookings")
async def get_user_bookings(current_user: dict = Depends(get_current_user)):
    with get_db_cursor() as cur:
        cur.execute(
            """
            SELECT b.*, e.title as event_title, e.event_date,
                   e.ticket_price, s.seat_number, z.name as zone_name,
                   t.status as payment_status
            FROM bookings b
            JOIN events e ON b.event_id = e.event_id
            JOIN seats s ON b.seat_id = s.seat_id
            JOIN club_zones z ON s.zone_id = z.zone_id
            LEFT JOIN transactions t ON b.booking_id = t.booking_id
            WHERE b.user_id = %s
            ORDER BY e.event_date DESC
            """,
            (current_user["user_id"],)
        )
        bookings = cur.fetchall()
        return bookings

@router.delete("/{booking_id}")
async def cancel_booking(
    booking_id: int,
    current_user: dict = Depends(get_current_user)
):
    with get_db_cursor(commit=True) as cur:
        # Check if booking exists and belongs to user
        cur.execute(
            """
            SELECT b.*, e.event_date
            FROM bookings b
            JOIN events e ON b.event_id = e.event_id
            WHERE b.booking_id = %s AND b.user_id = %s
            """,
            (booking_id, current_user["user_id"])
        )
        booking = cur.fetchone()
        
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
            
        if booking["event_date"] <= datetime.now():
            raise HTTPException(status_code=400, detail="Cannot cancel past events")
            
        # Delete booking and related transaction
        cur.execute("DELETE FROM transactions WHERE booking_id = %s", (booking_id,))
        cur.execute("DELETE FROM bookings WHERE booking_id = %s", (booking_id,))
        
        return {"message": "Booking cancelled successfully"} 