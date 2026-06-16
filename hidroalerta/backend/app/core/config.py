from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "HidroAlerta API"
    debug: bool = True
    api_prefix: str = "/api/v1"

    database_url: str = "postgresql+asyncpg://hidro:hidro@localhost:5433/hidroalerta"
    use_database: bool = False

    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"

    cors_origins: str = "http://localhost:5174,http://localhost:5173"

    # Ingestão externa
    openmeteo_url: str = "https://api.open-meteo.com/v1/forecast"
    hidroweb_base_url: str = "https://www.ana.gov.br/hidroweb"

    # Alertas — limiares (% da cota)
    threshold_attention_pct: float = 75.0
    threshold_danger_pct: float = 95.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
