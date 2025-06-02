from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import date
from database import get_db_cursor
from utils.auth import get_current_user, verify_password, get_password_hash

router = APIRouter()

class ProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[date] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

@router.get("/")
async def get_profile(current_user: dict = Depends(get_current_user)):
    with get_db_cursor() as cur:
        cur.execute(
            """
            SELECT u.user_id, u.username, u.email, u.role, u.created_at,
                   p.first_name, p.last_name, p.phone, p.birth_date
            FROM users u
            LEFT JOIN user_profiles p ON u.user_id = p.user_id
            WHERE u.user_id = %s
            """,
            (current_user["user_id"],)
        )
        profile = cur.fetchone()
        
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
            
        # Get user statistics
        cur.execute(
            """
            SELECT 
                COUNT(b.booking_id) as total_bookings,
                COALESCE(SUM(t.amount), 0) as total_spent,
                MAX(b.booking_date) as last_booking_date
            FROM bookings b
            LEFT JOIN transactions t ON b.booking_id = t.booking_id AND t.status = 'completed'
            WHERE b.user_id = %s
            """,
            (current_user["user_id"],)
        )
        stats = cur.fetchone() or {
            "total_bookings": 0,
            "total_spent": 0,
            "last_booking_date": None
        }
        
        return {**profile, "stats": stats}

@router.put("/")
async def update_profile(
    profile_update: ProfileUpdate,
    current_user: dict = Depends(get_current_user)
):
    with get_db_cursor(commit=True) as cur:
        # Check if profile exists, if not create it
        cur.execute(
            "SELECT profile_id FROM user_profiles WHERE user_id = %s",
            (current_user["user_id"],)
        )
        profile_exists = cur.fetchone()
        
        update_fields = []
        params = []
        
        for field, value in profile_update.dict(exclude_unset=True).items():
            if value is not None:
                update_fields.append(f"{field} = %s")
                params.append(value)
        
        if not update_fields:
            return {"message": "No fields to update"}
        
        if profile_exists:
            # Update existing profile
            params.append(current_user["user_id"])
            query = f"""
                UPDATE user_profiles
                SET {", ".join(update_fields)}
                WHERE user_id = %s
            """
            cur.execute(query, params)
        else:
            # Create new profile
            field_names = ["user_id"] + [field for field, value in profile_update.dict(exclude_unset=True).items() if value is not None]
            field_values = [current_user["user_id"]] + [value for field, value in profile_update.dict(exclude_unset=True).items() if value is not None]
            placeholders = ", ".join(["%s"] * len(field_values))
            
            query = f"""
                INSERT INTO user_profiles ({", ".join(field_names)})
                VALUES ({placeholders})
            """
            cur.execute(query, field_values)
        
        return {"message": "Profile updated successfully"}

@router.post("/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user: dict = Depends(get_current_user)
):
    with get_db_cursor(commit=True) as cur:
        # Get current password hash
        cur.execute(
            "SELECT password_hash FROM users WHERE user_id = %s",
            (current_user["user_id"],)
        )
        user = cur.fetchone()
        
        if not user or not verify_password(password_data.current_password, user["password_hash"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        
        # Update password
        new_password_hash = get_password_hash(password_data.new_password)
        cur.execute(
            "UPDATE users SET password_hash = %s WHERE user_id = %s",
            (new_password_hash, current_user["user_id"])
        )
        
        return {"message": "Password changed successfully"}