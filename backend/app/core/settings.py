from typing import Literal, Optional

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_environment: Literal['development', 'test', 'production'] = 'development'
    database_url: Optional[str] = None
    database_echo: bool = False
    secret_key: Optional[str] = None
    algorithm: Optional[str] = None
    access_token_expire_minutes: Optional[int] = None
    resend_api_key: Optional[str] = None
    resend_from: Optional[str] = None
    support_email: Optional[str] = None
    app_url: Optional[str] = None
    r2_endpoint_url: Optional[str] = None
    r2_access_key_id: Optional[str] = None
    r2_secret_access_key: Optional[str] = None
    r2_bucket_name: Optional[str] = None
    cors_allowed_origins: list[str] = Field(
        default_factory=lambda: [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'http://localhost:5174',
            'http://127.0.0.1:5174',
        ]
    )

    @field_validator('cors_allowed_origins')
    @classmethod
    def normalize_cors_allowed_origins(cls, origins: list[str]) -> list[str]:
        return [origin.strip().rstrip('/') for origin in origins if origin.strip()]

    @model_validator(mode='after')
    def validate_production_configuration(self) -> 'Settings':
        if self.app_environment != 'production':
            return self

        required: dict[str, str | int | None] = {
            'DATABASE_URL': self.database_url,
            'SECRET_KEY': self.secret_key,
            'ALGORITHM': self.algorithm,
            'ACCESS_TOKEN_EXPIRE_MINUTES': self.access_token_expire_minutes,
            'APP_URL': self.app_url,
            'R2_ENDPOINT_URL': self.r2_endpoint_url,
            'R2_ACCESS_KEY_ID': self.r2_access_key_id,
            'R2_SECRET_ACCESS_KEY': self.r2_secret_access_key,
            'R2_BUCKET_NAME': self.r2_bucket_name,
            'RESEND_API_KEY': self.resend_api_key,
            'RESEND_FROM': self.resend_from,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise ValueError(
                'Missing required production settings: ' + ', '.join(missing)
            )
        if not self.cors_allowed_origins:
            raise ValueError('CORS_ALLOWED_ORIGINS must be set in production')
        if self.database_echo:
            raise ValueError('DATABASE_ECHO must be false in production')
        if not self.app_url or not self.app_url.startswith('https://'):
            raise ValueError('APP_URL must use HTTPS in production')

        return self

    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore',
    )


settings = Settings()
