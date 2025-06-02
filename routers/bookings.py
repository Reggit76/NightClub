from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from utils.auth import verify_password, get_password_hash, create_access_token, generate_csrf_token
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
        # Check if login is email or username
        if "@" in user_data.username:
            # Login with email
            cur.execute(
                "SELECT user_id, username, password_hash, role, is_active FROM users WHERE email = %s",
                (user_data.username,)
            )
        else:
            # Login with username
            cur.execute(
                "SELECT user_id, username, password_hash, role, is_active FROM users WHERE username = %s",
                (user_data.username,)
            )
        
        user = cur.fetchone()
        
        if not user or not verify_password(user_data.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        if not user["is_active"]:
            raise HTTPException(status_code=401, detail="Account is disabled")
        
        token_data = {
            "user_id": user["user_id"],
            "username": user["username"],
            "role": user["role"]
        }
        
        # Generate access token
        access_token = create_access_token(token_data)
        
        # Generate CSRF token
        csrf_token = generate_csrf_token(user["user_id"])
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "csrf_token": csrf_token,
            "user": {
                "user_id": user["user_id"],
                "username": user["username"],
                "role": user["role"]
            }
        }

@router.post("/register")
async def register(user_data: UserRegister):
    try:
        validate_email(user_data.email)
    except EmailNotValidError:
        raise HTTPException(status_code=400, detail="Invalid email address")

    # Basic password validation
    if len(user_data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

    with get_db_cursor(commit=True) as cur:
        # Check if username or email already exists
        cur.execute(
            "SELECT username, email FROM users WHERE username = %s OR email = %s",
            (user_data.username, user_data.email)
        )
        existing_user = cur.fetchone()
        if existing_user:
            if existing_user["username"] == user_data.username:
                raise HTTPException(status_code=400, detail="Username already registered")
            else:
                raise HTTPException(status_code=400, detail="Email already registered")
        
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