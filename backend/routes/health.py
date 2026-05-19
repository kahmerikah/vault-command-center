from time import time

from flask import Blueprint
from sqlalchemy import text
from flask import current_app
from backend.extensions import db
from backend.models import ActivityLog
from backend.sockets.events import socket_health
from backend.services.container_metrics_service import ContainerMetricsService
import redis
from backend.utils.responses import success_response

health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health_check():
    return success_response({"service": "The SOMB Vault", "status": "ok"})


@health_bp.get("/health/system")
def system_health():
    db_ok = True
    redis_ok = True

    try:
        db.session.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    try:
        redis.from_url(current_app.config.get("REDIS_URL", "redis://redis:6379/0")).ping()
    except Exception:
        redis_ok = False

    container_metrics = ContainerMetricsService.collect()

    return success_response(
        {
            "service": "The SOMB Vault",
            "status": "ok" if db_ok and redis_ok else "degraded",
            "checks": {
                "database": db_ok,
                "redis": redis_ok,
                "websocket": socket_health(),
            },
            "uptime_hint": int(time()),
            "api_calls_total": ActivityLog.query.filter(ActivityLog.message.like("API call %")).count(),
            "containers": container_metrics,
        }
    )


@health_bp.get("/health/containers")
def containers_health():
    return success_response(ContainerMetricsService.collect())
