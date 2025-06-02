from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import Response
import uvicorn
from config import API_PREFIX
from utils.auth import get_current_user, generate_csrf_token
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
    yield
    # Shutdown
    logger.info("👋 Nightclub Booking System shutting down...")

app = FastAPI(
    title="NightClub Booking System",
    description="Comprehensive API for booking events at the nightclub",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
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

# Custom middleware to prevent caching in development
@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    
    # Add no-cache headers for API endpoints and static files in development
    if request.url.path.startswith("/api/") or request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    
    return response

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

# Custom StaticFiles class to add no-cache headers
class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        if isinstance(response, FileResponse):
            # Add no-cache headers for development
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

# Mount static files
static_path = "static"
if os.path.exists(static_path):
    app.mount("/static", NoCacheStaticFiles(directory=static_path), name="static")
    logger.info("Static files mounted successfully")
else:
    logger.warning(f"Static directory '{static_path}' not found")

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
        return JSONResponse(
            status_code=404,
            content={"detail": "API endpoint not found"}
        )
    
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
    logger.error(f"Validation error on {request.url}: {exc}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors() if hasattr(exc, 'errors') else "Validation error"}
    )

@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception):
    """Custom 500 handler"""
    logger.error(f"Internal server error on {request.url}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

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