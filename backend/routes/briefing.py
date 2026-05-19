"""Briefing routes — morning and night operational summaries."""
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.models.knowledge import BriefingLog
from backend.services.briefing_service import BriefingService
from backend.utils.responses import error_response, success_response

briefing_bp = Blueprint("briefing", __name__)


@briefing_bp.get("/morning")
@jwt_required()
def morning_briefing():
    user_id = get_jwt_identity()
    zip_code = request.args.get("zip", "90001")
    try:
        payload = BriefingService.morning(user_id=user_id, zip_code=zip_code)
        return success_response(payload)
    except Exception as exc:
        return error_response(f"Morning briefing failed: {exc}", 500)


@briefing_bp.get("/night")
@jwt_required()
def night_briefing():
    user_id = get_jwt_identity()
    try:
        payload = BriefingService.night(user_id=user_id)
        return success_response(payload)
    except Exception as exc:
        return error_response(f"Night briefing failed: {exc}", 500)


@briefing_bp.get("/history")
@jwt_required()
def briefing_history():
    user_id = get_jwt_identity()
    kind = request.args.get("kind")
    q = BriefingLog.query.filter_by(user_id=user_id)
    if kind:
        q = q.filter_by(kind=kind)
    logs = q.order_by(BriefingLog.created_at.desc()).limit(30).all()
    try:
        return success_response({
            "items": [
                {
                    "id": log.id,
                    "kind": log.kind,
                    "payload": log.payload,
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                }
                for log in logs
            ]
        })
    except Exception as exc:
        return error_response(f"Briefing history unavailable: {exc}", 500)


# ── Mobile-friendly endpoint (API key auth for iPhone Shortcuts widget) ────
@briefing_bp.get("/widget")
def briefing_widget():
    from backend.models.api_key import ApiKey
    key_value = request.headers.get("X-Vault-API-Key") or request.args.get("api_key")
    if not key_value:
        from backend.utils.responses import error_response
        return error_response("API key required", 401)
    api_key = ApiKey.query.filter_by(key=key_value, is_active=True).first()
    if not api_key:
        from backend.utils.responses import error_response
        return error_response("Invalid API key", 401)
    try:
        payload = BriefingService.morning(user_id=api_key.user_id)
        return success_response({
            "date": payload.get("date"),
            "weather": payload.get("weather"),
            "calendar_count": len(payload.get("calendar", [])),
            "notifications_unread": (payload.get("system") or {}).get("notifications_unread", 0),
            "priorities": payload.get("priorities", []),
        })
    except Exception as exc:
        return error_response(f"Briefing widget unavailable: {exc}", 500)
