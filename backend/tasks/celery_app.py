from celery import Celery
from backend.config import Config


celery_app = Celery(
    "somb_vault",
    broker=Config.CELERY_BROKER_URL,
    backend=Config.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(task_track_started=True, timezone="UTC")
