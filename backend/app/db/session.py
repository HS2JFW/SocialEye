from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.db.models import Base

# Handle sqlite vs postgresql connection string
db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(
    db_url,
    echo=settings.DEBUG,
    future=True
)

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

from sqlalchemy import text

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Migrate schema dynamically if new columns were added to existing tables
        try:
            await conn.execute(text("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS original_ai_scores JSON;"))
            await conn.execute(text("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS news_summary TEXT;"))
            await conn.execute(text("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS overall_virtues JSON;"))
            await conn.execute(text("ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS entity_evaluations JSON;"))
        except Exception as e:
            print(f"[SocialEye] Migration notice: {e}")

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
