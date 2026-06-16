from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = (
        "postgresql+asyncpg://digitaltwin:change_me@localhost:5432/digital_twin"
    )
    api_v1_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:5173"
    upload_dir: str = "uploads"
    max_upload_mb: int = 500
    las_max_upload_mb: int = 2048
    pdal_executable: str = "pdal"
    pdal_sample_stride: int = 0
    tiles3d_srs_out: str = "EPSG:4978"
    public_api_url: str = "http://localhost:8000"
    # InSAR / Sentinel-1
    copernicus_odata_url: str = "https://catalogue.dataspace.copernicus.eu/odata/v1"
    copernicus_username: str = ""
    copernicus_password: str = ""
    insar_max_scenes: int = 12
    insar_output_resolution_deg: float = 0.0005
    snap_gpt_path: str = ""
    snap_insar_graph_path: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def upload_path(self) -> Path:
        return Path(self.upload_dir)


settings = Settings()
