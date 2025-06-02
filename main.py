from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.trustedhost import TrustedHostMiddleware
import uvicorn
from config import API_PREFIX
from utils.auth import get_current_user, generate_csrf_token
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="NightClub Booking System",
    description="Comprehensive API for booking events at the nightclub",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Security middleware - add trusted hosts in production
# app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1"])

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with actual frontend domain
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Import and include routers
try:
    from routers import auth, events, bookings, admin, profile
    
    # API routes
    app.include_router(auth.router, prefix=f"{API_PREFIX}/auth", tags=["🔐 Authentication"])
    app.include_router(events.router, prefix=f"{API_PREFIX}/events", tags=["🎪 Events"])
    app.include_router(bookings.router, prefix=f"{API_PREFIX}/bookings", tags=["🎫 Bookings"])
    app.include_router(admin.router, prefix=f"{API_PREFIX}/admin", tags=["👨‍💼 Administration"])
    app.include_router(profile.router, prefix=f"{API_PREFIX}/profile", tags=["👤 User Profile"])
    
    logger.info("All routers loaded successfully")
except ImportError as e:
    logger.error(f"Failed to import routers: {e}")
    raise

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "service": "nightclub-booking-system",
        "version": "1.0.0"
    }

# CSRF token endpoint
@app.get(f"{API_PREFIX}/csrf-token")
async def get_csrf_token(current_user: dict = Depends(get_current_user)):
    """Get CSRF token for authenticated users"""
    token = generate_csrf_token(current_user["user_id"])
    return {"csrf_token": token}

# System info endpoint (for debugging in development)
@app.get(f"{API_PREFIX}/system-info")
async def get_system_info():
    """Get basic system information (development only)"""
    return {
        "api_version": "1.0.0",
        "api_prefix": API_PREFIX,
        "endpoints": {
            "auth": f"{API_PREFIX}/auth",
            "events": f"{API_PREFIX}/events", 
            "bookings": f"{API_PREFIX}/bookings",
            "admin": f"{API_PREFIX}/admin",
            "profile": f"{API_PREFIX}/profile"
        }
    }

# Mount static files
static_path = "static"
if os.path.exists(static_path):
    app.mount("/static", StaticFiles(directory=static_path), name="static")
    logger.info("Static files mounted successfully")
else:
    logger.warning(f"Static directory '{static_path}' not found")

@app.get("/")
async def root():
    """Serve the main application page"""
    index_path = os.path.join("static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    else:
        raise HTTPException(status_code=404, detail="Application not found")

# Handle SPA routes - return index.html for any non-API routes
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve SPA for all non-API routes"""
    # Don't serve SPA for API routes
    if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("redoc"):
        raise HTTPException(status_code=404, detail="API route not found")
    
    # Don't serve SPA for static files
    if full_path.startswith("static/"):
        raise HTTPException(status_code=404, detail="Static file not found")
    
    index_path = os.path.join("static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    else:
        raise HTTPException(status_code=404, detail="Application not found")

# Exception handlers
@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    """Custom 404 handler"""
    # For API routes, return JSON
    if request.url.path.startswith(f"{API_PREFIX}/"):
        return {"detail": "API endpoint not found"}
    
    # For web routes, serve the SPA
    index_path = os.path.join("static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    else:
        return {"detail": "Application not found"}

@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception):
    """Custom 500 handler"""
    logger.error(f"Internal server error: {exc}")
    return {"detail": "Internal server error"}

# Startup event
@app.on_event("startup")
async def startup_event():
    """Application startup event"""
    logger.info("🎪 Nightclub Booking System starting up...")
    logger.info(f"📚 API Documentation available at: /docs")
    logger.info(f"🔗 API Base URL: {API_PREFIX}")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown event"""
    logger.info("👋 Nightclub Booking System shutting down...")

if __name__ == "__main__":
    # Development server configuration
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=8000, 
        reload=True,
        reload_dirs=["./"],
        log_level="info"
    )