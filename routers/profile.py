from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import date, datetime
from database import get_db_cursor
from utils.auth import (
    get_current_user, 
    verify_password, 
    get_password_hash
)
from utils.helpers import log_user_action
import json

router = APIRouter()

class ProfileUpdate(BaseModel):
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None

class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str

class AccountDelete(BaseModel):
    password: str

@router.get("/me")
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get user profile"""
    with get_db_cursor() as cur:
        cur.execute(
            """
            SELECT u.user_id, u.username, u.email, u.role, u.is_active, u.created_at,
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
                COUNT(*) as total_bookings,
                COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as active_bookings,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings
            FROM bookings 
            WHERE user_id = %s
            """,
            (current_user["user_id"],)
        )
        stats = cur.fetchone()
        
        result = dict(profile)
        result['stats'] = dict(stats) if stats else {
            'total_bookings': 0,
            'active_bookings': 0,
            'cancelled_bookings': 0
        }
        
        return result

@router.put("/me")
async def update_profile(
    profile: ProfileUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update user profile"""
    with get_db_cursor(commit=True) as cur:
        updated_fields = []
        
        # Update email in users table if provided
        if profile.email:
            # Check if email is already taken by another user
            cur.execute(
                "SELECT user_id FROM users WHERE email = %s AND user_id != %s",
                (profile.email, current_user["user_id"])
            )
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Email уже используется")
            
            cur.execute(
                "UPDATE users SET email = %s WHERE user_id = %s",
                (profile.email, current_user["user_id"])
            )
            updated_fields.append("email")
        
        # Check if profile exists
        cur.execute(
            "SELECT * FROM user_profiles WHERE user_id = %s",
            (current_user["user_id"],)
        )
        existing_profile = cur.fetchone()
        
        if existing_profile:
            # Update existing profile
            update_fields = []
            params = []
            
            if profile.first_name is not None:
                update_fields.append("first_name = %s")
                params.append(profile.first_name)
                updated_fields.append("first_name")
            
            if profile.last_name is not None:
                update_fields.append("last_name = %s")
                params.append(profile.last_name)
                updated_fields.append("last_name")
            
            if profile.phone is not None:
                update_fields.append("phone = %s")
                params.append(profile.phone)
                updated_fields.append("phone")
            
            if update_fields:
                params.append(current_user["user_id"])
                query = f"""
                    UPDATE user_profiles
                    SET {", ".join(update_fields)}
                    WHERE user_id = %s
                    RETURNING *
                """
                cur.execute(query, params)
                updated_profile = cur.fetchone()
        else:
            # Create new profile
            cur.execute(
                """
                INSERT INTO user_profiles (user_id, first_name, last_name, phone)
                VALUES (%s, %s, %s, %s)
                RETURNING *
                """,
                (current_user["user_id"], profile.first_name, profile.last_name, profile.phone)
            )
            updated_profile = cur.fetchone()
            updated_fields.extend(["first_name", "last_name", "phone"])
        
        # Log the action
        log_user_action(
            current_user["user_id"],
            "update_profile",
            {"updated_fields": updated_fields}
        )
        
        # Get complete profile data
        cur.execute(
            """
            SELECT u.user_id, u.username, u.email, u.role, u.is_active, u.created_at,
                   p.first_name, p.last_name, p.phone, p.birth_date
            FROM users u
            LEFT JOIN user_profiles p ON u.user_id = p.user_id
            WHERE u.user_id = %s
            """,
            (current_user["user_id"],)
        )
        return cur.fetchone()

@router.put("/me/password")
async def update_password(
    password_update: PasswordUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update user password"""
    with get_db_cursor(commit=True) as cur:
        # Get current password hash
        cur.execute(
            "SELECT password_hash FROM users WHERE user_id = %s",
            (current_user["user_id"],)
        )
        user = cur.fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Verify current password
        if not verify_password(password_update.current_password, user["password_hash"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        
        # Validate new password
        if len(password_update.new_password) < 6:
            raise HTTPException(status_code=400, detail="New password must be at least 6 characters long")
        
        # Update password
        new_password_hash = get_password_hash(password_update.new_password)
        cur.execute(
            "UPDATE users SET password_hash = %s WHERE user_id = %s",
            (new_password_hash, current_user["user_id"])
        )
        
        # Log the action
        log_user_action(
            current_user["user_id"],
            "update_password",
            {"timestamp": datetime.now().isoformat()}
        )
        
        return {"message": "Password updated successfully"}

@router.delete("/me")
async def delete_account(
    account_delete: AccountDelete,
    current_user: dict = Depends(get_current_user)
):
    """Delete user account"""
    with get_db_cursor(commit=True) as cur:
        # Get current password hash
        cur.execute(
            "SELECT password_hash FROM users WHERE user_id = %s",
            (current_user["user_id"],)
        )
        user = cur.fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Verify password
        if not verify_password(account_delete.password, user["password_hash"]):
            raise HTTPException(status_code=400, detail="Password is incorrect")
        
        # Check for active bookings
        cur.execute(
            """
            SELECT COUNT(*) as active_bookings
            FROM bookings
            WHERE user_id = %s AND status IN ('confirmed', 'pending')
            """,
            (current_user["user_id"],)
        )
        active_bookings = cur.fetchone()["active_bookings"]
        
        if active_bookings > 0:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot delete account with {active_bookings} active booking(s). Please cancel them first."
            )
        
        # Log the action before deletion
        log_user_action(
            current_user["user_id"],
            "delete_account",
            {
                "username": current_user["username"],
                "timestamp": datetime.now().isoformat()
            }
        )
        
        # Delete user (cascade will handle related data)
        cur.execute(
            "UPDATE users SET is_active = false, email = %s WHERE user_id = %s",
            (f"deleted_{current_user['user_id']}@deleted.local", current_user["user_id"])
        )
        
        return {"message": "Account successfully deleted"}

# Legacy endpoint for backward compatibility
@router.get("/")
async def get_profile_legacy(current_user: dict = Depends(get_current_user)):
    """Get user profile (legacy endpoint)"""
    return await get_profile(current_user)

@router.put("/")
async def update_profile_legacy(
    profile: ProfileUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update user profile (legacy endpoint)"""
    return await update_profile(profile, current_user)