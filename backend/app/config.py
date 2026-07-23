from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        # Supabase (y otras fuentes) devuelven postgres:// o postgresql://
        # SQLAlchemy async necesita el driver explícito: postgresql+asyncpg://
        for prefix in ("postgresql://", "postgres://"):
            if v.startswith(prefix):
                return "postgresql+asyncpg://" + v[len(prefix):]
        return v

    whatsapp_verify_token: str
    whatsapp_token: str
    whatsapp_phone_number_id: str

    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "capataz-media"
    r2_public_url: str = ""

    openai_api_key: str = ""

    company_id: str
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    secret_key: str = "dev-secret-change-in-prod"
    access_token_expire_minutes: int = 1440


settings = Settings()  # type: ignore[call-arg]
