from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from database import get_db_cursor
from utils.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    verify_csrf
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
        
        # Log the action directly using the same cursor
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
        
        # Create access token
        token = create_access_token({"sub": str(new_user["user_id"])})
        
        return JSONResponse(
            content={
                "access_token": token,
                "token_type": "bearer",
                "user": {
                    "user_id": new_user["user_id"],
                    "email": new_user["email"],
                    "username": new_user["username"],
                    "first_name": profile["first_name"],
                    "last_name": profile["last_name"],
                    "role": new_user["role"]
                }
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
            WHERE u.username = %s
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
            
        # Create access token
        token = create_access_token({
            "sub": str(db_user["user_id"]),
            "role": db_user["role"]
        })
        
        # Log the action
        details_json = json.dumps({"username": user.username})
        cur.execute(
            """
            INSERT INTO audit_logs (user_id, action, details)
            VALUES (%s, %s, %s)
            """,
            (db_user["user_id"], "login", details_json)
        )
        
        return JSONResponse(
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

@router.post("/logout")
async def logout(current_user: dict = Depends(verify_csrf())):
    with get_db_cursor(commit=True) as cur:
        # Log the action
        details_json = json.dumps({"username": current_user.get("username")})
        cur.execute(
            """
            INSERT INTO audit_logs (user_id, action, details)
            VALUES (%s, %s, %s)
            """,
            (current_user["user_id"], "logout", details_json)
        )
    
    return JSONResponse(content={"message": "Successfully logged out"})

@router.get("/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    with get_db_cursor() as cur:
        # Get user and profile data
        cur.execute(
            """
            SELECT u.*, p.first_name, p.last_name
            FROM users u
            LEFT JOIN user_profiles p ON u.user_id = p.user_id
            WHERE u.user_id = %s
            """,
            (current_user["sub"],)
        )
        user_data = cur.fetchone()
        
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")
            
        return JSONResponse(content={
            "user_id": user_data["user_id"],
            "email": user_data["email"],
            "username": user_data["username"],
            "first_name": user_data["first_name"],
            "last_name": user_data["last_name"],
            "role": user_data["role"]
        })