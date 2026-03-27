"""Application settings loaded from environment variables / .env file."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://localhost/shadowedvaca"
    secret_key: str = "dev-secret-key-change-in-production"
    environment: str = "development"
    site_url: str = "https://shadowedvaca.com"
    cors_origins: str = "https://shadowedvaca.com"
    sv_tools_url: str = "https://sv-tools.shadowedvaca.com"
    sv_tools_api_key: str = ""
    sv_tools_callback_key: str = ""  # sv-tools sends this to call back into sv-site

    # JWT settings
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480  # 8 hours

    # Feedback ingest
    feedback_ingest_key: str = ""    # clients must send this header to POST /api/feedback/ingest
    anthropic_api_key: str = ""      # for AI processing; empty = skip AI gracefully


@lru_cache
def get_settings() -> Settings:
    return Settings()
