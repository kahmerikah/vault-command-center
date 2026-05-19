"""Mobile / iPhone Shortcuts webhook endpoints.

These accept requests from iPhone Shortcuts via API key in headers.
Supports: quick note, quick property, quick task trigger.
"""
from flask import Blueprint, request
from backend.models.api_key import ApiKey
from backend.services.knowledge_service import KnowledgeService
from backend.services.notification_service import NotificationService
from backend.services.activity_service import ActivityService
from backend.utils.responses import error_response, success_response

mobile_bp = Blueprint("mobile", __name__)


def _auth_api_key():
    key_value = request.headers.get("X-Vault-API-Key") or (request.json or {}).get("api_key")
    if not key_value:
        return None, error_response("API key required", 401)
    api_key = ApiKey.query.filter_by(key=key_value, is_active=True).first()
    if not api_key:
        return None, error_response("Invalid API key", 401)
    return api_key, None


@mobile_bp.post("/note")
def quick_note():
    """Shortcut: add a quick note to the Knowledge OS."""
    api_key, err = _auth_api_key()
    if err:
        return err
    data = request.json or {}
    if not data.get("title") or not data.get("body"):
        return error_response("title and body required", 400)
    entry = KnowledgeService.create(user_id=api_key.user_id, data={
        **data,
        "source": "iphone_shortcut",
        "kind": data.get("kind", "note"),
    })
    return success_response({"id": entry.id, "title": entry.title}, 201)


@mobile_bp.post("/alert")
def quick_alert():
    """Shortcut: push a notification to the Vault."""
    api_key, err = _auth_api_key()
    if err:
        return err
    data = request.json or {}
    if not data.get("title"):
        return error_response("title required", 400)
    NotificationService.create(
        user_id=api_key.user_id,
        title=data["title"],
        body=data.get("body", ""),
        kind=data.get("kind", "info"),
    )
    ActivityService.log(
        user_id=api_key.user_id,
        message=f"iPhone alert: {data['title']}",
        level="info",
    )
    return success_response({"queued": True})


@mobile_bp.post("/event")
def quick_event():
    """Shortcut: log a custom activity event."""
    api_key, err = _auth_api_key()
    if err:
        return err
    data = request.json or {}
    message = data.get("message", "iPhone event")
    ActivityService.log(
        user_id=api_key.user_id,
        message=message,
        level=data.get("level", "info"),
    )
    return success_response({"logged": True})


@mobile_bp.get("/briefing")
def mobile_briefing():
    """Shortcut: GET morning briefing as a widget-safe summary."""
    api_key, err = _auth_api_key()
    if err:
        return err
    from backend.services.briefing_service import BriefingService
    payload = BriefingService.morning(user_id=api_key.user_id, zip_code=request.args.get("zip", "90001"))
    return success_response({
        "date": payload.get("date"),
        "weather": payload.get("weather"),
        "events_today": len(payload.get("calendar", [])),
        "priorities": payload.get("priorities", []),
        "finances": payload.get("finances"),
    })
