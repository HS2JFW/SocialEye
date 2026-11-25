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
    
    # Neo4j Graph Database
    NEO4J_URI: str = "bolt://neo4j:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "socialeye_secret"
    
    # Ingestion & Evaluation Settings
    INGEST_INTERVAL_MINUTES: int = 60
    MAX_ITEMS_PER_FEED: int = 15
    DAILY_BUDGET_THB: float = 500.0
    
    # CORS
    ALLOWED_ORIGINS: str = "*"

    # Authentik OIDC & RBAC
    AUTH_ENABLED: bool = True
    OIDC_ISSUER: str = "https://auth.addpay.in.th/application/o/socialeye/"
    OIDC_CLIENT_ID: str = "socialeye-web"
    OIDC_JWKS_URL: str = ""
    AUTH_DEV_ROLE: str = "admin"

    @property
    def is_auth_enforced(self) -> bool:
        if self.APP_ENV.lower() == "production":
            return True
        return self.AUTH_ENABLED

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
