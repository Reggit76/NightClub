from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import get_db_cursor
from utils.auth import get_current_user
from utils.helpers import log_user_action, check_seat_availability
import json

router = APIRouter()

class BookingCreate(BaseModel):
    event_id: int
    seat_id: int

class BookingUpdate(BaseModel):
    status: str

class PaymentRequest(BaseModel):
    booking_id: int
    payment_method: str

@router.post("/", status_code=201)
async def create_booking(
    booking: BookingCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new booking"""
    with get_db_cursor(commit=True) as cur:
        # Check if event exists and is available for booking
        cur.execute(
            """
            SELECT e.*, ez.zone_id, ez.available_seats, ez.zone_price
            FROM events e
            LEFT JOIN event_zones ez ON e.event_id = ez.event_id
            LEFT JOIN seats s ON s.zone_id = ez.zone_id
            WHERE e.event_id = %s AND s.seat_id = %s AND e.status = 'planned'
            """,
            (booking.event_id, booking.seat_id)
        )
        event = cur.fetchone()
        
        if not event:
            raise HTTPException(status_code=404, detail="Event not found or not available for booking")
        
        if event["event_date"] <= datetime.now():
            raise HTTPException(status_code=400, detail="Event has already started or ended")
        
        # Check if seat is available
        if not check_seat_availability(booking.event_id, booking.seat_id):
            raise HTTPException(status_code=400, detail="Seat is already booked")
        
        # Get the ticket price from event zones
        price = event.get("zone_price", event.get("ticket_price", 0))
        
        # Create booking
        cur.execute(
            """
            INSERT INTO bookings (event_id, user_id, seat_id, status, booking_date)
            VALUES (%s, %s, %s, 'pending', CURRENT_TIMESTAMP)
            RETURNING booking_id, event_id, user_id, seat_id, status, booking_date
            """,
            (booking.event_id, current_user["user_id"], booking.seat_id)
        )
        new_booking = cur.fetchone()
        
        # Create pending transaction
        cur.execute(
            """
            INSERT INTO transactions (booking_id, user_id, amount, status, payment_method, transaction_date)
            VALUES (%s, %s, %s, 'pending', 'pending', CURRENT_TIMESTAMP)
            RETURNING transaction_id
            """,
            (new_booking["booking_id"], current_user["user_id"], price)
        )
        transaction = cur.fetchone()
        
        # Log the action
        log_user_action(
            current_user["user_id"],
            "create_booking",
            {
                "booking_id": new_booking["booking_id"],
                "event_id": booking.event_id,
                "seat_id": booking.seat_id,
                "price": float(price)
            }
        )
        
        result = dict(new_booking)
        result["price"] = price
        result["transaction_id"] = transaction["transaction_id"]
        
        return result

@router.get("/my")
async def get_my_bookings(current_user: dict = Depends(get_current_user)):
    """Get user's bookings"""
    with get_db_cursor() as cur:
        cur.execute(
            """
            SELECT b.*, e.title as event_title, e.event_date,
                   s.seat_number, z.name as zone_name,
                   t.status as payment_status, t.payment_method, t.amount as price,
                   t.transaction_date as payment_date
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
async def get_booking(
    booking_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Get specific booking details"""
    with get_db_cursor() as cur:
        cur.execute(
            """
            SELECT b.*, e.title as event_title, e.event_date, e.description as event_description,
                   s.seat_number, z.name as zone_name,
                   t.status as payment_status, t.payment_method, t.amount as price,
                   t.transaction_date as payment_date
            FROM bookings b
            JOIN events e ON b.event_id = e.event_id
            JOIN seats s ON b.seat_id = s.seat_id
            JOIN club_zones z ON s.zone_id = z.zone_id
            LEFT JOIN transactions t ON b.booking_id = t.booking_id
            WHERE b.booking_id = %s
            """,
            (booking_id,)
        )
        booking = cur.fetchone()
        
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Check if user owns this booking or is admin/moderator
        if (booking["user_id"] != current_user["user_id"] and 
            current_user["role"] not in ["admin", "moderator"]):
            raise HTTPException(status_code=403, detail="Not authorized to view this booking")
        
        return dict(booking)

@router.post("/{booking_id}/confirm")
async def confirm_booking(
    booking_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Confirm a pending booking"""
    with get_db_cursor(commit=True) as cur:
        # Check if booking exists and belongs to user
        cur.execute(
            """
            SELECT b.*, e.status as event_status, e.event_date
            FROM bookings b
            JOIN events e ON b.event_id = e.event_id
            WHERE b.booking_id = %s
            """,
            (booking_id,)
        )
        booking = cur.fetchone()
        
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        if (booking["user_id"] != current_user["user_id"] and 
            current_user["role"] not in ["admin", "moderator"]):
            raise HTTPException(status_code=403, detail="Not authorized to confirm this booking")
        
        if booking["status"] != "pending":
            raise HTTPException(status_code=400, detail="Booking is not pending")
        
        if booking["event_status"] == "cancelled":
            raise HTTPException(status_code=400, detail="Cannot confirm booking for cancelled event")
        
        if booking["event_date"] <= datetime.now():
            raise HTTPException(status_code=400, detail="Cannot confirm booking for past event")
        
        # Update booking status
        cur.execute(
            """
            UPDATE bookings
            SET status = 'confirmed'
            WHERE booking_id = %s
            RETURNING *
            """,
            (booking_id,)
        )
        updated_booking = cur.fetchone()
        
        # Log the action
        log_user_action(
            current_user["user_id"],
            "confirm_booking",
            {"booking_id": booking_id}
        )
        
        return dict(updated_booking)

@router.post("/{booking_id}/cancel")
async def cancel_booking(
    booking_id: int,
    current_user: dict = Depends(get_current_user)
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
        
        if (booking["user_id"] != current_user["user_id"] and 
            current_user["role"] not in ["admin", "moderator"]):
            raise HTTPException(status_code=403, detail="Not authorized to cancel this booking")
        
        if booking["status"] == "cancelled":
            raise HTTPException(status_code=400, detail="Booking is already cancelled")
        
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
        
        # If there was a completed payment, mark it for refund
        cur.execute(
            """
            UPDATE transactions
            SET status = 'refunded'
            WHERE booking_id = %s AND status = 'completed'
            """,
            (booking_id,)
        )
        
        # Log the action
        log_user_action(
            current_user["user_id"],
            "cancel_booking",
            {"booking_id": booking_id}
        )
        
        return dict(cancelled_booking)

@router.post("/pay")
async def process_payment(
    payment: PaymentRequest,
    current_user: dict = Depends(get_current_user)
):
    """Process payment for a booking (simulation)"""
    with get_db_cursor(commit=True) as cur:
        # Check if booking exists and belongs to user
        cur.execute(
            """
            SELECT b.*, t.amount, t.status as payment_status
            FROM bookings b
            LEFT JOIN transactions t ON b.booking_id = t.booking_id
            WHERE b.booking_id = %s
            """,
            (payment.booking_id,)
        )
        booking = cur.fetchone()
        
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        if booking["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Not authorized to pay for this booking")
        
        if booking["status"] != "pending":
            raise HTTPException(status_code=400, detail="Booking is not pending payment")
        
        if booking["payment_status"] == "completed":
            raise HTTPException(status_code=400, detail="Payment already completed")
        
        # Update transaction
        cur.execute(
            """
            UPDATE transactions
            SET status = 'completed', payment_method = %s, transaction_date = CURRENT_TIMESTAMP
            WHERE booking_id = %s
            RETURNING *
            """,
            (payment.payment_method, payment.booking_id)
        )
        transaction = cur.fetchone()
        
        # Update booking status to confirmed
        cur.execute(
            """
            UPDATE bookings
            SET status = 'confirmed'
            WHERE booking_id = %s
            """,
            (payment.booking_id,)
        )
        
        # Log the action
        log_user_action(
            current_user["user_id"],
            "process_payment",
            {
                "booking_id": payment.booking_id,
                "amount": float(transaction["amount"]),
                "payment_method": payment.payment_method
            }
        )
        
        return {
            "message": "Payment processed successfully",
            "transaction": dict(transaction)
        }