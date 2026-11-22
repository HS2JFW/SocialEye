from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    APP_NAME: str = "SocialEye"
    APP_ENV: str = "production"
    DEBUG: bool = False
    
    # LiteLLM Gateway
    LITELLM_ENDPOINT: str = "https://llm.addpay.in.th/v1"
    LITELLM_API_KEY: str = ""
    LITELLM_MODEL: str = "gemma-4-31b-it"
    LITELLM_EMBEDDING_MODEL: str = "embeded"
    
    # Database (defaults to SQLite if not PostgreSQL)
    DATABASE_URL: str = "sqlite+aiosqlite:///./socialeye.db"
    
    # Ingestion & Evaluation Settings
    INGEST_INTERVAL_MINUTES: int = 60
    MAX_ITEMS_PER_FEED: int = 15
    DAILY_BUDGET_THB: float = 500.0
    
    # CORS
    ALLOWED_ORIGINS: str = "*"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
