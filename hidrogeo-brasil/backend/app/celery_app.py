"""Celery — sync ANM SIGMINE / SOPLE."""

import os

from celery import Celery
from celery.schedules import crontab

redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery("hidrogeo", broker=redis_url, backend=redis_url)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Sao_Paulo",
    enable_utc=True,
    imports=("app.tasks.mining_sync",),
    task_routes={"app.tasks.mining_sync.*": {"queue": "mining"}},
    beat_schedule={
        "sigmine-daily-sync": {
            "task": "app.tasks.mining_sync.sync_all_ufs_task",
            "schedule": crontab(hour=6, minute=0),
        },
    },
)

celery_app.autodiscover_tasks(["app.tasks"], force=True)
