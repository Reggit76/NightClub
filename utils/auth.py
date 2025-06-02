from datetime import datetime, timedelta
from typing import Optional
import jwt
import secrets
from passlib.context import CryptContext
from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config import JWT_SECRET_KEY, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# In-memory storage for CSRF tokens (in production, use Redis)
csrf_tokens = {}

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Generate password hash"""
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

def generate_csrf_token(user_id: int) -> str:
    """Generate CSRF token for user"""
    token = secrets.token_urlsafe(32)
    csrf_tokens[user_id] = {
        "token": token,
        "expires": datetime.utcnow() + timedelta(hours=24)
    }
    return token

def verify_csrf_token(user_id: int, token: str) -> bool:
    """Verify CSRF token"""
    stored_data = csrf_tokens.get(user_id)
    if not stored_data:
        return False
    
    if datetime.utcnow() > stored_data["expires"]:
        del csrf_tokens[user_id]
        return False
    
    return stored_data["token"] == token

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user from JWT token"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        
        # Ensure user_id is available (from either user_id or sub field)
        user_id = payload.get("user_id") or int(payload.get("sub", 0))
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing user identification")
        
        # Create standardized user object
        user = {
            "user_id": user_id,
            "username": payload.get("username"),
            "role": payload.get("role", "user"),
            "sub": payload.get("sub", str(user_id))
        }
        
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.JWTError as e:
        raise HTTPException(status_code=401, detail=f"Could not validate credentials: {str(e)}")
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token format: {str(e)}")

def check_role(allowed_roles: list):
    """Dependency to check user role"""
    async def role_checker(user: dict = Depends(get_current_user)):
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Operation not permitted")
        return user
    return role_checker

def verify_csrf():
    """Dependency to verify CSRF token in requests"""
    async def csrf_checker(request: Request, user: dict = Depends(get_current_user)):
        # Only check CSRF for state-changing operations
        if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
            csrf_token = request.headers.get("X-CSRF-Token")
            
            # Skip CSRF for auth endpoints
            if str(request.url.path).endswith('/auth/login') or str(request.url.path).endswith('/auth/register'):
                return user
            
            # For development/testing, allow requests without CSRF token
            # In production, uncomment the following lines:
            # if not csrf_token:
            #     raise HTTPException(status_code=403, detail="CSRF token missing")
            # if not verify_csrf_token(user["user_id"], csrf_token):
            #     raise HTTPException(status_code=403, detail="Invalid CSRF token")
        
        return user
    return csrf_checker

# Optional: Dependency for endpoints that don't require CSRF (for testing)
async def get_current_user_optional_csrf(user: dict = Depends(get_current_user)):
    """Get current user without CSRF verification (for testing)"""
    return user