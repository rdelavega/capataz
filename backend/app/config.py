from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str

    whatsapp_verify_token: str
    whatsapp_token: str
    whatsapp_phone_number_id: str

    r2_account_id: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket_name: str
    r2_public_url: str

    openai_api_key: str

    company_id: str


settings = Settings()  # type: ignore[call-arg]
