from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    data_dir: Path = Path(__file__).resolve().parent.parent / "data"
    upload_dir: Path = Path(__file__).resolve().parent.parent / "data" / "uploads"
    output_dir: Path = Path(__file__).resolve().parent.parent / "data" / "outputs"
    max_upload_mb: int = 512
    max_compare_side: int = 2048
    cors_origins: str = "http://localhost:3000,http://localhost:3001"
    unet_weights_path: Path | None = None

    def ensure_dirs(self) -> None:
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_dirs()
