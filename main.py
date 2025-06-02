from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
from config import API_PREFIX
import os

app = FastAPI(title="NightClub Booking System",
             description="API for booking events at the nightclub",
             version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with actual frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers
from routers import auth, events, bookings, admin

# API routes
app.include_router(auth.router, prefix=f"{API_PREFIX}/auth", tags=["Authentication"])
app.include_router(events.router, prefix=f"{API_PREFIX}/events", tags=["Events"])
app.include_router(bookings.router, prefix=f"{API_PREFIX}/bookings", tags=["Bookings"])
app.include_router(admin.router, prefix=f"{API_PREFIX}/admin", tags=["Admin"])

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return FileResponse('static/index.html')

# Handle SPA routes - return index.html for any non-API routes
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")
    return FileResponse('static/index.html')

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True) 