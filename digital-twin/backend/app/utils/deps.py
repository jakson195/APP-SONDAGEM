import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.geotech import Project


async def get_project_or_404(
    session: AsyncSession, project_id: uuid.UUID
) -> Project:
    project = await session.scalar(
        select(Project).where(Project.id == project_id)
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return project
