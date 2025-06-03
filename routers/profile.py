from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import date, datetime
from database import get_db_cursor
from utils.auth import get_current_user, verify_password, get_password_hash, verifier, SessionData
from utils.helpers import log_user_action

router = APIRouter()

class ProfileUpdate(BaseModel):
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None

class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str

@router.get("/")
async def get_profile(session: SessionData = Depends(verifier)):
    """Get user profile"""
    with get_db_cursor() as cur:
        cur.execute(
            """
            SELECT u.user_id, u.username, u.email, u.role,
                   p.first_name, p.last_name, p.phone
            FROM users u
            LEFT JOIN user_profiles p ON u.user_id = p.user_id
            WHERE u.user_id = %s
            """,
            (session.user_id,)
        )
        profile = cur.fetchone()
        
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        return profile

@router.put("/")
async def update_profile(
    profile: ProfileUpdate,
    session: SessionData = Depends(verifier)
):
    """Update user profile"""
    with get_db_cursor(commit=True) as cur:
        # Update email in users table if provided
        if profile.email:
            cur.execute(
                "UPDATE users SET email = %s WHERE user_id = %s",
                (profile.email, session.user_id)
            )
        
        # Check if profile exists
        cur.execute(
            "SELECT * FROM user_profiles WHERE user_id = %s",
            (session.user_id,)
        )
        existing_profile = cur.fetchone()
        
        if existing_profile:
            # Update existing profile
            update_fields = []
            params = []
            
            if profile.first_name is not None:
                update_fields.append("first_name = %s")
                params.append(profile.first_name)
            
            if profile.last_name is not None:
                update_fields.append("last_name = %s")
                params.append(profile.last_name)
            
            if profile.phone is not None:
                update_fields.append("phone = %s")
                params.append(profile.phone)
            
            if update_fields:
                params.append(session.user_id)
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
                (session.user_id, profile.first_name, profile.last_name, profile.phone)
            )
            updated_profile = cur.fetchone()
        
        # Log the action
        log_user_action(
            session.user_id,
            "update_profile",
            {
                "updated_fields": [
                    field for field in ["email", "first_name", "last_name", "phone"]
                    if getattr(profile, field) is not None
                ]
            }
        )
        
        # Get complete profile data
        cur.execute(
            """
            SELECT u.user_id, u.username, u.email, u.role,
                   p.first_name, p.last_name, p.phone
            FROM users u
            LEFT JOIN user_profiles p ON u.user_id = p.user_id
            WHERE u.user_id = %s
            """,
            (session.user_id,)
        )
        return cur.fetchone()

@router.put("/password")
async def update_password(
    password_update: PasswordUpdate,
    session: SessionData = Depends(verifier)
):
    """Update user password"""
    with get_db_cursor(commit=True) as cur:
        # Get current password hash
        cur.execute(
            "SELECT password_hash FROM users WHERE user_id = %s",
            (session.user_id,)
        )
        user = cur.fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Verify current password
        if not verify_password(password_update.current_password, user["password_hash"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        
        # Update password
        new_password_hash = get_password_hash(password_update.new_password)
        cur.execute(
            "UPDATE users SET password_hash = %s WHERE user_id = %s",
            (new_password_hash, session.user_id)
        )
        
        # Log the action
        log_user_action(
            session.user_id,
            "update_password",
            {"timestamp": datetime.now().isoformat()}
        )
        
        return {"message": "Password updated successfully"}