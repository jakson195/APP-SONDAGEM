from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db

router = APIRouter(prefix="/twin", tags=["twin"])


class AssetSummary(BaseModel):
    id: str
    name: str
    asset_type: str


@router.get("/assets", response_model=list[AssetSummary])
async def list_assets(db: AsyncSession = Depends(get_db)) -> list[AssetSummary]:
    result = await db.execute(
        text(
            """
            SELECT id::text, name, asset_type
            FROM twin.assets
            ORDER BY created_at DESC
            LIMIT 100
            """
        )
    )
    return [
        AssetSummary(id=row[0], name=row[1], asset_type=row[2])
        for row in result.fetchall()
    ]


class ViewerConfig(BaseModel):
    cesium_ion_token: str | None = Field(
        default=None,
        description="Token Ion (opcional); o frontend pode usar VITE_CESIUM_ION_TOKEN",
    )
    default_view: dict[str, float] = Field(
        default_factory=lambda: {
            "longitude": -8.0,
            "latitude": 39.5,
            "height": 25000.0,
        }
    )


@router.get("/viewer-config", response_model=ViewerConfig)
async def viewer_config() -> ViewerConfig:
    return ViewerConfig()
