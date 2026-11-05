import logging
import os

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


DEV_SECRET_KEY = "dev-secret-change-in-prod"


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
    # App Secret de la app de Meta (App settings → Basic). Valida X-Hub-Signature-256.
    whatsapp_app_secret: str = ""

    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "capataz-media"
    r2_public_url: str = ""

    openai_api_key: str = ""

    company_id: str
    timezone: str = "America/Merida"

    # Jornada: después de workday_start + late_tolerance_minutes el check-in es "tarde".
    workday_start: str = "08:00"
    late_tolerance_minutes: int = 10
    # Días de descanso (0=lunes … 6=domingo), separados por coma.
    rest_weekdays: str = "6"

    # Verificación de presencia. Al checar, el bot pide la ubicación y la compara
    # con la de la obra; las coordenadas se borran después de unos días y solo
    # queda el resultado (en obra / a X km / sin ubicación).
    checkin_ask_location: bool = True
    geofence_meters: int = 300
    location_retention_days: int = 90
    location_purge_time: str = "03:30"
    # Fotos casi idénticas a una anterior se marcan como repetidas.
    duplicate_photo_days: int = 60

    # Mensajes proactivos (plantillas de WhatsApp aprobadas por Meta).
    # Si el nombre de una plantilla está vacío, ese envío automático no corre.
    scheduler_enabled: bool = True
    # Recordatorios automáticos a trabajadores (llegada 8:30, avance 15:00).
    proactive_enabled: bool = True
    wa_template_lang: str = "es_MX"
    wa_template_checkin_reminder: str = ""
    wa_template_job_progress: str = ""
    wa_template_job_assigned: str = ""
    wa_template_daily_summary: str = ""
    checkin_reminder_time: str = "08:30"
    job_progress_time: str = "15:00"
    daily_summary_time: str = "18:00"
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    # Firma los tokens de login. En producción DEBE venir de la variable SECRET_KEY:
    # con el valor por defecto (público en el repo) cualquiera podría falsificar un login.
    secret_key: str = DEV_SECRET_KEY
    access_token_expire_minutes: int = 1440


    @model_validator(mode="after")
    def _require_secret_in_production(self) -> "Settings":
        # Railway define RAILWAY_ENVIRONMENT_NAME en cada deploy.
        in_railway = any(k.startswith("RAILWAY_ENVIRONMENT") for k in os.environ)
        if in_railway and self.secret_key == DEV_SECRET_KEY:
            raise ValueError(
                "SECRET_KEY no está configurada en Railway. "
                "Genera una con: python3 -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        if in_railway and len(self.secret_key) < 32:
            logging.getLogger(__name__).warning(
                "SECRET_KEY tiene menos de 32 caracteres; conviene una más larga."
            )
        return self


settings = Settings()  # type: ignore[call-arg]
