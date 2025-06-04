# Updated main.py with improved auth handling
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import Response
import uvicorn
from config import API_PREFIX
from utils.auth import get_current_user
import os
import logging
from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Nightclub Booking System starting up...")
    logger.info(f"📚 API Documentation available at: /docs")
    logger.info(f"🔗 API Base URL: {API_PREFIX}")
    logger.info(f"🏠 Admin Dashboard: /admin-dashboard.html")
    logger.info(f"👤 Profile Page: /profile.html")
    yield
    # Shutdown
    logger.info("🛑 Nightclub Booking System shutting down...")

app = FastAPI(
    title="NightClub Booking System",
    description="""
    Comprehensive API for booking events at the nightclub with zone-based pricing.
    
    ## Features
    - 🎫 Event management with zone configuration
    - 👥 User management with role-based access
    - 🏛️ Admin panel with audit logs
    - 💳 Payment processing simulation
    - 🔐 Secure JWT authentication
    
    ## Authentication
    - Use `/auth/login` to get JWT token
    - Include token in Authorization header: `Bearer <token>`
    
    ## User Roles
    - **Admin**: Full access to all features including audit logs
    - **Moderator**: Can manage users (except admins) and events
    - **User**: Can book events and manage profile
    """,
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Enhanced CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with actual frontend domain
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"]
)

# Custom middleware for development and security headers
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    
    # Add security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    
    # Add no-cache headers for API endpoints and static files in development
    if request.url.path.startswith("/api/") or request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    
    # Log API requests for debugging
    if request.url.path.startswith("/api/"):
        logger.info(f"🌐 {request.method} {request.url.path} -> {response.status_code}")
    
    return response

# Health check endpoint with enhanced information
@app.get("/health")
async def health_check():
    """Enhanced health check endpoint for monitoring"""
    try:
        from database import get_db_cursor
        
        # Test database connection
        with get_db_cursor() as cur:
            cur.execute("SELECT 1")
            db_status = "healthy"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        db_status = "unhealthy"
    
    return {
        "status": "healthy" if db_status == "healthy" else "degraded",
        "service": "nightclub-booking-system",
        "version": "2.0.0",
        "database": db_status,
        "features": {
            "zone_pricing": True,
            "jwt_auth": True,
            "role_based_access": True,
            "audit_logs": True
        }
    }

# Import and include routers
try:
    from routers import auth, events, bookings, admin, profile
    
    # API routes - These must be defined BEFORE the catch-all route
    app.include_router(auth.router, prefix=f"{API_PREFIX}/auth", tags=["Authentication"])
    app.include_router(events.router, prefix=f"{API_PREFIX}/events", tags=["Events"])
    app.include_router(bookings.router, prefix=f"{API_PREFIX}/bookings", tags=["Bookings"])
    app.include_router(admin.router, prefix=f"{API_PREFIX}", tags=["Administration"])
    app.include_router(profile.router, prefix=f"{API_PREFIX}/users", tags=["User Profile"])
    
    logger.info("✅ All routers loaded successfully")
    
except ImportError as e:
    logger.error(f"❌ Failed to import routers: {e}")
    logger.error("Make sure all router files exist and have no syntax errors")
    raise
except Exception as e:
    logger.error(f"❌ Error setting up routers: {e}")
    raise

# System info endpoint (for debugging in development)
@app.get(f"{API_PREFIX}/system-info")
async def get_system_info():
    """Get basic system information (development only)"""
    return {
        "api_version": "2.0.0",
        "api_prefix": API_PREFIX,
        "authentication": "JWT Bearer Token",
        "features": {
            "zone_based_pricing": True,
            "jwt_auth": True,
            "role_restrictions": True,
            "audit_logging": True,
            "static_pages": True
        },
        "endpoints": {
            "auth": f"{API_PREFIX}/auth",
            "events": f"{API_PREFIX}/events", 
            "bookings": f"{API_PREFIX}/bookings",
            "admin": f"{API_PREFIX}/admin",
            "profile": f"{API_PREFIX}/users"
        },
        "static_pages": [
            "/profile.html",
            "/admin-dashboard.html"
        ]
    }

# User verification endpoint for frontend
@app.get(f"{API_PREFIX}/verify")
async def verify_user(current_user: dict = Depends(get_current_user)):
    """Verify JWT token and return user information"""
    return {
        "valid": True,
        "user": current_user
    }

# Custom StaticFiles class with enhanced headers
class EnhancedStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        if isinstance(response, FileResponse):
            # Add no-cache headers for development
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
            
            # Add content type for specific files
            if path.endswith('.js'):
                response.headers["Content-Type"] = "application/javascript"
            elif path.endswith('.css'):
                response.headers["Content-Type"] = "text/css"
        return response

# Mount static files
static_path = "static"
if os.path.exists(static_path):
    app.mount("/static", EnhancedStaticFiles(directory=static_path), name="static")
    logger.info("📁 Static files mounted successfully")
else:
    logger.warning(f"⚠️ Static directory '{static_path}' not found")

# Exception handlers
@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    """Custom 404 handler with static page support"""
    # For API routes, return JSON
    if request.url.path.startswith(f"{API_PREFIX}/"):
        logger.warning(f"⚠️ API 404: {request.method} {request.url.path}")
        return JSONResponse(
            status_code=404,
            content={"detail": f"API endpoint not found: {request.url.path}"}
        )
    
    # For static pages, check if they exist
    static_pages = {
        "/profile": "profile.html",
        "/admin-dashboard": "admin-dashboard.html"
    }
    
    if request.url.path in static_pages:
        static_file = os.path.join("static", static_pages[request.url.path])
        if os.path.exists(static_file):
            return FileResponse(static_file)
    
    # For web routes, serve the SPA
    index_path = os.path.join("static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    else:
        return JSONResponse(
            status_code=404,
            content={"detail": "Application not found"}
        )

@app.exception_handler(422)
async def validation_exception_handler(request: Request, exc):
    """Custom 422 handler for validation errors"""
    logger.error(f"❌ Validation error on {request.url}: {exc}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors() if hasattr(exc, 'errors') else "Validation error"}
    )

@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception):
    """Custom 500 handler"""
    logger.error(f"💥 Internal server error on {request.url}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)