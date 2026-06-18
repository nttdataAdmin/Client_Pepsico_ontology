from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.backend.app.api.routes import (
    ai,
    anomalies,
    assets,
    forms,
    maintenance,
    recommendations,
    root_cause,
    super_excel,
)

app = FastAPI(title="PEPSICO MANAGEMENT SYSTEM API", version="1.0.0")

# CORS: do not use allow_credentials=True with allow_origins=["*"]
# browsers reject that combo (shows as "Failed to fetch").
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(assets.router)
app.include_router(anomalies.router)
app.include_router(root_cause.router)
app.include_router(recommendations.router)
app.include_router(ai.router)
app.include_router(maintenance.router)
app.include_router(super_excel.router)
app.include_router(forms.router)


@app.get("/")
async def root():
    return {"message": "PEPSICO MANAGEMENT SYSTEM API"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
