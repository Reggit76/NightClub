from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import get_db_cursor
from utils.auth import get_current_user, verify_csrf
from utils.helpers import log_user_action, check_seat_availability

router = APIRouter()

class BookingCreate(BaseModel):
    event_id: int
    seat_id: int

class PaymentProcess(BaseModel):
    booking_id: int
    payment_method: str

@router.get("/my-bookings")
async def get_my_bookings(current_user: dict = Depends(get_current_user)):
    with get_db_cursor() as cur:
        cur.execute(
            """
            SELECT 
                b.*,
                e.title as event_title,
                e.event_date,
                e.description,
                e.duration,
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
            """,
            (current_user["user_id"],)
        )
        bookings = cur.fetchall()
        return [dict(booking) for booking in bookings]

@router.get("/{booking_id}")
async def get_booking_details(
    booking_id: int,
    current_user: dict = Depends(get_current_user)
):
    with get_db_cursor() as cur:
        cur.execute(
            """
            SELECT 
                b.*,
                e.title as event_title,
                e.event_date,
                e.description,
                e.duration,
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
            WHERE b.booking_id = %s AND b.user_id = %s
            """,
            (booking_id, current_user["user_id"])
        )
        booking = cur.fetchone()
        
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
            
        return dict(booking)

@router.post("/", status_code=201)
async def create_booking(
    booking: BookingCreate,
    current_user: dict = Depends(get_current_user)  # Simplified for now
):
    print(f"Creating booking: {booking.dict()} for user: {current_user}")
    
    with get_db_cursor(commit=True) as cur:
        # Check if event exists and is in the future
        cur.execute(
            "SELECT * FROM events WHERE event_id = %s AND event_date > NOW()",
            (booking.event_id,)
        )
        event = cur.fetchone()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found or has already started")
        
        print(f"Event found: {dict(event)}")
        
        # Check if seat exists and is available
        if not check_seat_availability(booking.event_id, booking.seat_id):
            raise HTTPException(status_code=400, detail="Seat is not available")
        
        print(f"Seat is available")
        
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
        
        print(f"Booking created with ID: {booking_id}")
        
        # Log the action
        log_user_action(
            current_user["user_id"],
            "create_booking",
            {
                "booking_id": booking_id,
                "event_id": booking.event_id,
                "seat_id": booking.seat_id
            }
        )
        
        return {"booking_id": booking_id, "message": "Booking created successfully"}

@router.post("/pay")
async def process_payment(
    payment: PaymentProcess,
    current_user: dict = Depends(get_current_user)  # Simplified for now
):
    print(f"Processing payment: {payment.dict()} for user: {current_user}")
    
    with get_db_cursor(commit=True) as cur:
        # Check if booking belongs to current user and is pending
        cur.execute(
            """
            SELECT b.*, e.ticket_price
            FROM bookings b
            JOIN events e ON b.event_id = e.event_id
            WHERE b.booking_id = %s AND b.user_id = %s AND b.status = 'pending'
            """,
            (payment.booking_id, current_user["user_id"])
        )
        booking = cur.fetchone()
        
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found or already processed")
        
        print(f"Booking found: {dict(booking)}")
        
        # Create transaction record
        cur.execute(
            """
            INSERT INTO transactions (booking_id, user_id, amount, payment_method, status)
            VALUES (%s, %s, %s, %s, 'completed')
            RETURNING transaction_id
            """,
            (payment.booking_id, current_user["user_id"], 
             booking["ticket_price"], payment.payment_method)
        )
        transaction_id = cur.fetchone()["transaction_id"]
        
        print(f"Transaction created with ID: {transaction_id}")
        
        # Update booking status
        cur.execute(
            "UPDATE bookings SET status = 'confirmed' WHERE booking_id = %s",
            (payment.booking_id,)
        )
        
        print(f"Booking {payment.booking_id} confirmed")
        
        # Log the action
        log_user_action(
            current_user["user_id"],
            "process_payment",
            {
                "booking_id": payment.booking_id,
                "transaction_id": transaction_id,
                "amount": float(booking["ticket_price"]),
                "payment_method": payment.payment_method
            }
        )
        
        return {"message": "Payment processed successfully", "transaction_id": transaction_id}

@router.delete("/{booking_id}")
async def cancel_booking(
    booking_id: int,
    current_user: dict = Depends(get_current_user)  # Simplified for now
):
    print(f"Canceling booking {booking_id} for user: {current_user}")
    
    with get_db_cursor(commit=True) as cur:
        # Check if booking belongs to current user and can be cancelled
        cur.execute(
            """
            SELECT b.*, e.event_date
            FROM bookings b
            JOIN events e ON b.event_id = e.event_id
            WHERE b.booking_id = %s AND b.user_id = %s AND b.status IN ('pending', 'confirmed')
            """,
            (booking_id, current_user["user_id"])
        )
        booking = cur.fetchone()
        
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found or cannot be cancelled")
        
        print(f"Booking found: {dict(booking)}")
        
        # Check if event hasn't started yet
        if booking["event_date"] <= datetime.now():
            raise HTTPException(status_code=400, detail="Cannot cancel booking for event that has already started")
        
        # Cancel booking
        cur.execute(
            "UPDATE bookings SET status = 'cancelled' WHERE booking_id = %s",
            (booking_id,)
        )
        
        print(f"Booking {booking_id} cancelled")
        
        # If there was a payment, mark transaction as refunded
        cur.execute(
            "UPDATE transactions SET status = 'refunded' WHERE booking_id = %s",
            (booking_id,)
        )
        
        print(f"Transaction refunded for booking {booking_id}")
        
        # Log the action
        log_user_action(
            current_user["user_id"],
            "cancel_booking",
            {"booking_id": booking_id}
        )
        
        return {"message": "Booking cancelled successfully"}