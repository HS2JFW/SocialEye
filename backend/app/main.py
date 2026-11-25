import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.session import init_db, AsyncSessionLocal
from app.api.routes import router as api_router
from app.ingest.scheduler import start_scheduler, stop_scheduler
from app.data.seed_data import seed_golden_dataset
from app.rag.graph import graph_manager
from app.settings_service import seed_default_settings_and_sources

async def _bg_seed():
    try:
        async with AsyncSessionLocal() as session:
            await seed_default_settings_and_sources(session)
            await seed_golden_dataset(session)
    except Exception as e:
        print(f"[SocialEye] Seed dataset notice: {e}")
    try:
        await graph_manager.init_schema()
    except Exception as e:
        print(f"[SocialEye] Graph schema notice: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("[SocialEye] Initializing database...")
    await init_db()
    asyncio.create_task(_bg_seed())

    print("[SocialEye] Starting background scheduler...")
    try:
        start_scheduler()
    except Exception as e:
        print(f"[SocialEye] Scheduler notice: {e}")
    yield
    # Shutdown
    print("[SocialEye] Shutting down...")
    try:
        stop_scheduler()
    except Exception as e:
        pass
    try:
        await graph_manager.close()
    except Exception as e:
        pass

app = FastAPI(
    title="SocialEye API",
    description="ระบบ AI Agent เฝ้าระวังสื่อและโซเชียลมีเดีย ต่อดัชนีคุณธรรม 5 ด้าน",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "SocialEye Backend",
        "model": settings.LITELLM_MODEL,
        "embedding_model": settings.LITELLM_EMBEDDING_MODEL
    }
