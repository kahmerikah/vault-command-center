from urllib.parse import urlencode

from flask import Blueprint, current_app, redirect, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from itsdangerous import BadSignature, SignatureExpired

from backend.services.integration_service import IntegrationService
from backend.utils.responses import error_response, success_response


integrations_bp = Blueprint("integrations", __name__)


@integrations_bp.get("/providers")
@jwt_required()
def provider_status():
    user_id = get_jwt_identity()
    return success_response(IntegrationService.provider_status(user_id))


@integrations_bp.get("/google/connect")
@jwt_required()
def connect_google():
    user_id = get_jwt_identity()
    try:
        auth_url = IntegrationService.connect_url("google", user_id)
    except ValueError as exc:
        return error_response(str(exc), 400)
    return success_response({"provider": "google", "auth_url": auth_url})


@integrations_bp.get("/microsoft/connect")
@jwt_required()
def connect_microsoft():
    user_id = get_jwt_identity()
    try:
        auth_url = IntegrationService.connect_url("microsoft", user_id)
    except ValueError as exc:
        return error_response(str(exc), 400)
    return success_response({"provider": "microsoft", "auth_url": auth_url})


@integrations_bp.get("/google/callback")
def callback_google():
    return _provider_callback("google")


@integrations_bp.get("/microsoft/callback")
def callback_microsoft():
    return _provider_callback("microsoft")


@integrations_bp.post("/google/sync")
@jwt_required()
def sync_google():
    user_id = get_jwt_identity()
    try:
        result = IntegrationService.sync_google(user_id)
    except ValueError as exc:
        return error_response(str(exc), 400)
    return success_response(result)


@integrations_bp.post("/microsoft/sync")
@jwt_required()
def sync_microsoft():
    user_id = get_jwt_identity()
    try:
        result = IntegrationService.sync_microsoft(user_id)
    except ValueError as exc:
        return error_response(str(exc), 400)
    return success_response(result)


@integrations_bp.post("/ical/import")
@jwt_required()
def import_ical_text():
    user_id = get_jwt_identity()
    payload = request.get_json(silent=True) or {}
    try:
        result = IntegrationService.sync_ical_text(
            user_id=user_id,
            ics_text=payload.get("ics") or payload.get("vcalendar") or "",
            source_name="manual_import",
        )
    except ValueError as exc:
        return error_response(str(exc), 400)
    return success_response(result)


@integrations_bp.post("/ical/sync-url")
@jwt_required()
def sync_ical_url():
    user_id = get_jwt_identity()
    payload = request.get_json(silent=True) or {}
    try:
        result = IntegrationService.sync_ical_url(user_id=user_id, ics_url=payload.get("ics_url") or "")
    except ValueError as exc:
        return error_response(str(exc), 400)
    return success_response(result)


@integrations_bp.post("/ical/sync")
@jwt_required()
def sync_saved_ical_url():
    user_id = get_jwt_identity()
    try:
        result = IntegrationService.sync_saved_ical_url(user_id)
    except ValueError as exc:
        return error_response(str(exc), 400)
    return success_response(result)


@integrations_bp.post("/disconnect/<provider>")
@jwt_required()
def disconnect_provider(provider):
    user_id = get_jwt_identity()
    if provider not in {"google", "microsoft", "ical"}:
        return error_response("unsupported provider", 400)
    IntegrationService.disconnect(user_id=user_id, provider=provider)
    return success_response({"provider": provider, "disconnected": True})


@integrations_bp.post("/zillow/search")
@jwt_required()
def zillow_search():
    payload = request.get_json(silent=True) or {}
    location = payload.get("location") or payload.get("zip_code") or ""
    status_type = payload.get("status_type") or "ForSale"
    limit = int(payload.get("limit") or 20)
    try:
        result = IntegrationService.zillow_search(location=location, status_type=status_type, limit=limit)
    except ValueError as exc:
        return error_response(str(exc), 400)
    return success_response(result)


@integrations_bp.post("/zillow/estimate")
@jwt_required()
def zillow_estimate():
    payload = request.get_json(silent=True) or {}
    try:
        result = IntegrationService.zillow_estimate(payload)
    except ValueError as exc:
        return error_response(str(exc), 400)
    return success_response(result)


def _provider_callback(provider: str):
    code = request.args.get("code") or ""
    state = request.args.get("state") or ""
    oauth_error = request.args.get("error") or ""

    if oauth_error:
        return redirect(_frontend_result_url(provider, "error", oauth_error))

    try:
        IntegrationService.handle_callback(provider=provider, code=code, state=state)
    except (ValueError, BadSignature, SignatureExpired) as exc:
        return redirect(_frontend_result_url(provider, "error", str(exc)))

    return redirect(_frontend_result_url(provider, "connected", ""))


def _frontend_result_url(provider: str, status: str, message: str) -> str:
    origin = (current_app.config.get("FRONTEND_ORIGIN") or "").rstrip("/")
    path = f"{origin}/pda" if origin else "/pda"
    query = {"integration": provider, "status": status}
    if message:
        query["message"] = message[:200]
    return f"{path}?{urlencode(query)}"
