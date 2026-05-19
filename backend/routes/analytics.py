from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func
from backend.models import ActivityLog, AnalyticsEvent, Session
from backend.services.analytics_service import AnalyticsService
from backend.utils.responses import success_response

analytics_bp = Blueprint("analytics", __name__)


@analytics_bp.post("/events")
@jwt_required()
def create_event():
    payload = request.get_json(silent=True) or {}
    event = AnalyticsService.track(
        module_key=payload.get("module_key", "core"),
        event_type=payload.get("event_type", "unknown"),
        payload=payload.get("payload", {}),
        user_id=get_jwt_identity(),
    )
    return success_response({"id": event.id}, 201)


@analytics_bp.get("/summary")
@jwt_required()
def summary():
    return success_response(
        {
            "events_total": AnalyticsEvent.query.count(),
            "api_calls_total": ActivityLog.query.filter(ActivityLog.message.like("API call %")).count(),
            "active_sessions": Session.query.filter_by(is_revoked=False).count(),
            "failed_auth_total": ActivityLog.query.filter(ActivityLog.message.like("Failed login%")).count(),
        }
    )


@analytics_bp.get("/timeline")
@jwt_required()
def timeline():
    limit = min(max(int(request.args.get("limit", 24)), 1), 240)
    rows = (
        ActivityLog.query.with_entities(func.date(ActivityLog.created_at), func.count(ActivityLog.id))
        .group_by(func.date(ActivityLog.created_at))
        .order_by(func.date(ActivityLog.created_at).desc())
        .limit(limit)
        .all()
    )
    return success_response(
        {
            "points": [
                {
                    "date": str(day),
                    "count": total,
                }
                for day, total in reversed(rows)
            ]
        }
    )
