from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: Optional[str] = None
    secret_key: Optional[str] = None
    algorithm: Optional[str] = None
    access_token_expire_minutes: Optional[int] = None
    resend_api_key: Optional[str] = None
    resend_from: Optional[str] = None
    app_url: Optional[str] = None
    r2_endpoint_url: Optional[str] = None
    r2_access_key_id: Optional[str] = None
    r2_secret_access_key: Optional[str] = None
    r2_bucket_name: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
    )


settings = Settings()
