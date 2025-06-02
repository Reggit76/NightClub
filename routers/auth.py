from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from utils.auth import verify_password, get_password_hash, create_access_token
from database import get_db_cursor
from email_validator import validate_email, EmailNotValidError

router = APIRouter()

class UserLogin(BaseModel):
    username: str
    password: str

class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str
    first_name: str
    last_name: str

@router.post("/login")
async def login(user_data: UserLogin):
    with get_db_cursor() as cur:
        cur.execute(
            "SELECT user_id, username, password_hash, role FROM users WHERE username = %s",
            (user_data.username,)
        )
        user = cur.fetchone()
        
        if not user or not verify_password(user_data.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        token_data = {
            "user_id": user["user_id"],
            "username": user["username"],
            "role": user["role"]
        }
        
        return {
            "access_token": create_access_token(token_data),
            "token_type": "bearer"
        }

@router.post("/register")
async def register(user_data: UserRegister):
    try:
        validate_email(user_data.email)
    except EmailNotValidError:
        raise HTTPException(status_code=400, detail="Invalid email address")

    with get_db_cursor(commit=True) as cur:
        # Check if username or email already exists
        cur.execute(
            "SELECT username, email FROM users WHERE username = %s OR email = %s",
            (user_data.username, user_data.email)
        )
        existing_user = cur.fetchone()
        if existing_user:
            raise HTTPException(status_code=400, detail="Username or email already registered")
        
        # Create new user
        cur.execute(
            """
            INSERT INTO users (username, email, password_hash, role)
            VALUES (%s, %s, %s, 'user')
            RETURNING user_id
            """,
            (user_data.username, user_data.email, get_password_hash(user_data.password))
        )
        user_id = cur.fetchone()["user_id"]
        
        # Create user profile
        cur.execute(
            """
            INSERT INTO user_profiles (user_id, first_name, last_name)
            VALUES (%s, %s, %s)
            """,
            (user_id, user_data.first_name, user_data.last_name)
        )
        
        return {"message": "User registered successfully"} 