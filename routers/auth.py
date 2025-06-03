from fastapi import APIRouter, HTTPException, Depends, Response
from pydantic import BaseModel, EmailStr
from typing import Optional
from database import get_db_cursor
from utils.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    decode_token
)
from utils.helpers import log_user_action
from fastapi.responses import JSONResponse
import json

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
        
        return JSONResponse(
            content={
                "message": "User registered successfully",
                "user_id": new_user["user_id"]
            }
        )

@router.post("/login")
async def login(user: UserLogin):
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
        
        response = JSONResponse(
            content={
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
        )
        
        # Set JWT token as httpOnly cookie
        response.set_cookie(
            key="nightclub_session",
            value=token,
            httponly=True,
            max_age=24 * 60 * 60,  # 1 day
            samesite="lax",
            secure=False  # Set to True in production with HTTPS
        )
        
        return response

@router.post("/logout")
async def logout():
    response = JSONResponse(content={"message": "Successfully logged out"})
    response.delete_cookie(key="nightclub_session")
    return response

@router.get("/session")
async def get_session(current_user: dict = Depends(get_current_user)):
    return current_user

@router.get("/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    try:
        with get_db_cursor() as cur:
            # Get user and profile data using user_id from token
            user_id = current_user.get("user_id") or int(current_user.get("sub", 0))
            
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
                "stats": stats
            }
            
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get user info: {str(e)}"
        )