from time import time

from flask import Blueprint
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.analytics.metrics import dashboard_metrics, revenue_by_day
from backend.middleware.auth import require_roles
from backend.models import ActivityLog, Notification
from backend.sockets.events import socket_health
from backend.utils.responses import success_response

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.get("/overview")
@jwt_required()
@require_roles("super_admin", "admin", "moderator", "seller", "member")
def overview():
    user_id = get_jwt_identity()
    notifications = Notification.query.order_by(Notification.created_at.desc()).limit(10).all()
    activity = ActivityLog.query.order_by(ActivityLog.created_at.desc()).limit(10).all()

    uptime_seconds = int(time()) - int(getattr(dashboard_bp, "started_at", 0) or 0)
    if uptime_seconds <= 0:
        uptime_seconds = int(time())

    return success_response(
        {
            "metrics": {
                **dashboard_metrics(user_id=user_id),
                "notifications_total": Notification.query.count(),
                "uptime_seconds": uptime_seconds,
                **socket_health(),
            },
            "revenue_trend": revenue_by_day(),
            "websocket": socket_health(),
            "notifications": [
                {"id": n.id, "title": n.title, "body": n.body, "created_at": n.created_at.isoformat()}
                for n in notifications
            ],
            "activity": [
                {"id": a.id, "level": a.level, "message": a.message, "created_at": a.created_at.isoformat()}
                for a in activity
            ],
        }
    )


dashboard_bp.started_at = int(time())
