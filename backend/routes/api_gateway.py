from flask import Blueprint, g, request
from backend.extensions import db
from backend.models import ActivityLog
from backend.utils.responses import success_response

gateway_bp = Blueprint("gateway", __name__)


@gateway_bp.before_app_request
def log_request():
    if not request.path.startswith("/api/"):
        return
    db.session.add(
        ActivityLog(
            actor_id=None,
            level="info",
            message=f"API call {request.method} {request.path}",
            meta={"request_id": getattr(g, "request_id", "n/a")},
        )
    )
    db.session.commit()


@gateway_bp.get("/status")
def gateway_status():
    return success_response({"gateway": "online", "version": "v1"})
