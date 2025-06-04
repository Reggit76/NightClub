from fastapi import APIRouter, HTTPException, Depends, Response
from pydantic import BaseModel, EmailStr
from typing import Optional
from database import get_db_cursor
from utils.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user
)
from utils.helpers import log_user_action
from fastapi.responses import JSONResponse
import json
import logging

logger = logging.getLogger('nightclub')

router = APIRouter()

class UserLogin(BaseModel):
    username: str
    password: str

class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str
    first_name: str
    last_name: str

@router.post("/register")
async def register(user: UserRegister):
    """Register a new user"""
    with get_db_cursor(commit=True) as cur:
        # Check if user exists
        cur.execute("SELECT * FROM users WHERE email = %s OR username = %s", (user.email, user.username))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Email or username already registered")
            
        # Hash password
        password_hash = get_password_hash(user.password)
        
        # Create user
        cur.execute(
            """
            INSERT INTO users (email, username, password_hash, role)
            VALUES (%s, %s, %s, 'user')
            RETURNING user_id, email, username, role
            """,
            (user.email, user.username, password_hash)
        )
        new_user = cur.fetchone()
        
        # Create user profile
        cur.execute(
            """
            INSERT INTO user_profiles (user_id, first_name, last_name)
            VALUES (%s, %s, %s)
            RETURNING profile_id, first_name, last_name
            """,
            (new_user["user_id"], user.first_name, user.last_name)
        )
        profile = cur.fetchone()
        
        # Log the action
        details_json = json.dumps({
            "email": user.email,
            "username": user.username,
            "profile_id": profile["profile_id"]
        })
        cur.execute(
            """
            INSERT INTO audit_logs (user_id, action, details)
            VALUES (%s, %s, %s)
            """,
            (new_user["user_id"], "register", details_json)
        )
        
        logger.info(f"New user registered: {user.username}")
        
        return {
            "message": "User registered successfully",
            "user_id": new_user["user_id"]
        }

@router.post("/login")
async def login(user: UserLogin):
    """Login user and return JWT token"""
    with get_db_cursor(commit=True) as cur:
        # Get user and profile data
        cur.execute(
            """
            SELECT u.*, p.first_name, p.last_name
            FROM users u
            LEFT JOIN user_profiles p ON u.user_id = p.user_id
            WHERE u.username = %s AND u.is_active = true
            """,
            (user.username,)
        )
        db_user = cur.fetchone()
        
        # Verify user exists and password is correct
        if not db_user or not verify_password(user.password, db_user["password_hash"]):
            logger.warning(f"Failed login attempt for username: {user.username}")
            raise HTTPException(
                status_code=401,
                detail="Incorrect username or password"
            )
            
        # Create access token with proper fields
        token_data = {
            "sub": str(db_user["user_id"]),
            "user_id": db_user["user_id"],
            "username": db_user["username"],
            "role": db_user["role"]
        }
        
        token = create_access_token(token_data)
        
        # Log the action
        details_json = json.dumps({"username": user.username})
        cur.execute(
            """
            INSERT INTO audit_logs (user_id, action, details)
            VALUES (%s, %s, %s)
            """,
            (db_user["user_id"], "login", details_json)
        )
        
        logger.info(f"User logged in: {user.username} (role: {db_user['role']})")
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "user_id": db_user["user_id"],
                "email": db_user["email"],
                "username": db_user["username"],
                "first_name": db_user["first_name"],
                "last_name": db_user["last_name"],
                "role": db_user["role"]
            }
        }

@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Logout user"""
    # Log the action
    with get_db_cursor(commit=True) as cur:
        details_json = json.dumps({"username": current_user["username"]})
        cur.execute(
            """
            INSERT INTO audit_logs (user_id, action, details)
            VALUES (%s, %s, %s)
            """,
            (current_user["user_id"], "logout", details_json)
        )
    
    logger.info(f"User logged out: {current_user['username']}")
    return {"message": "Successfully logged out"}

@router.get("/session")
async def get_session(current_user: dict = Depends(get_current_user)):
    """Get current session information"""
    return current_user

@router.get("/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current user detailed information"""
    try:
        with get_db_cursor() as cur:
            # Get user and profile data using user_id from token
            user_id = current_user.get("user_id")
            
            cur.execute(
                """
                SELECT u.*, p.first_name, p.last_name
                FROM users u
                LEFT JOIN user_profiles p ON u.user_id = p.user_id
                WHERE u.user_id = %s AND u.is_active = true
                """,
                (user_id,)
            )
            user_data = cur.fetchone()
            
            if not user_data:
                raise HTTPException(status_code=404, detail="User not found")
            
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
                (user_id,)
            )
            stats = cur.fetchone()
            
            return {
                "user_id": user_data["user_id"],
                "email": user_data["email"],
                "username": user_data["username"],
                "first_name": user_data["first_name"],
                "last_name": user_data["last_name"],
                "role": user_data["role"],
                "is_active": user_data["is_active"],
                "stats": dict(stats) if stats else {}
            }
            
    except Exception as e:
        logger.error(f"Error getting user info: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get user info: {str(e)}"
        )

@router.post("/refresh")
async def refresh_token(current_user: dict = Depends(get_current_user)):
    """Refresh JWT token"""
    # Create new token with same data
    token_data = {
        "sub": str(current_user["user_id"]),
        "user_id": current_user["user_id"],
        "username": current_user["username"],
        "role": current_user["role"]
    }
    
    new_token = create_access_token(token_data)
    
    return {
        "access_token": new_token,
        "token_type": "bearer"
    }