from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.services.analytics_service import AnalyticsService
from backend.utils.responses import success_response

analytics_bp = Blueprint("analytics", __name__)


@analytics_bp.post("/events")
@jwt_required(optional=True)
def create_event():
    payload = request.get_json(silent=True) or {}
    event = AnalyticsService.track(
        module_key=payload.get("module_key", "core"),
        event_type=payload.get("event_type", "unknown"),
        payload=payload.get("payload", {}),
        user_id=get_jwt_identity(),
    )
    return success_response({"id": event.id}, 201)
