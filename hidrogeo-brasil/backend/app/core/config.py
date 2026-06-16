from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "HidroGeo Brasil API"
    api_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:5175,http://localhost:5173,http://localhost:3000"
    database_url: str = "postgresql+asyncpg://hidrogeo:hidrogeo@localhost:5434/hidrogeo"
    database_url_sync: str = "postgresql://hidrogeo:hidrogeo@localhost:5434/hidrogeo"
    tileserv_url: str = "http://localhost:7800"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
