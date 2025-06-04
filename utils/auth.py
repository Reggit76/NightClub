from datetime import datetime, timedelta
from typing import Optional
import jwt
from passlib.context import CryptContext
from fastapi import HTTPException, Depends, Request, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config import JWT_SECRET_KEY, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
import logging
from pydantic import BaseModel

logger = logging.getLogger('nightclub')

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

class SessionData(BaseModel):
    """Session data model for authenticated users"""
    user_id: int
    username: str
    role: str
    expires: datetime

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Get password hash"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> dict:
    """Decode and verify JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Token expired")
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.PyJWTError as e:
        logger.warning(f"Token validation failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Could not validate credentials")

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> dict:
    """Get current user from JWT token in Authorization header"""
    
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Authorization header required"
        )

    try:
        payload = decode_token(credentials.credentials)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token decode error: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid token")

    # Ensure user_id is available
    user_id = payload.get("user_id") or int(payload.get("sub", 0))
    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Invalid token: missing user identification"
        )

    # Create standardized user object
    user = {
        "user_id": user_id,
        "username": payload.get("username"),
        "role": payload.get("role", "user"),
        "sub": payload.get("sub", str(user_id))
    }

    return user

def check_role(allowed_roles: list):
    """Dependency to check user role"""
    async def role_checker(user: dict = Depends(get_current_user)):
        if user["role"] not in allowed_roles:
            logger.warning(f"Access denied for role {user['role']}, required: {allowed_roles}")
            raise HTTPException(status_code=403, detail="Operation not permitted")
        return user
    return role_checker

async def verifier(
    request: Request,
    user: dict = Depends(get_current_user)
) -> SessionData:
    """Return session data"""
    return SessionData(
        user_id=user["user_id"],
        username=user["username"],
        role=user["role"],
        expires=datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )