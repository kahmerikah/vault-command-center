from flask import Blueprint, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from backend.services.auth_service import AuthService
from backend.models import User
from backend.utils.responses import error_response, success_response
from backend.utils.validators import is_valid_email, normalize_email

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email_raw = data.get("email") or ""
    password = data.get("password") or ""
    role = data.get("role") or "member"

    if not username or not password or not is_valid_email(email_raw):
        return error_response("invalid registration payload", 400)

    try:
        user = AuthService.register(username=username, email=normalize_email(email_raw), password=password, role_name=role)
    except ValueError as exc:
        return error_response(str(exc), 400)

    return success_response({"id": user.id, "username": user.username, "email": user.email}, 201)


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    identity = data.get("identity") or ""
    password = data.get("password") or ""

    try:
        payload = AuthService.login(
            identity=identity,
            password=password,
            user_agent=request.headers.get("User-Agent", ""),
            ip_address=request.remote_addr or "",
        )
    except ValueError as exc:
        return error_response(str(exc), 401)

    return success_response(
        {
            "access_token": payload["access_token"],
            "refresh_token": payload["refresh_token"],
            "user": {
                "id": payload["user"].id,
                "username": payload["user"].username,
                "email": payload["user"].email,
                "role": payload["user"].role.name,
            },
        }
    )


@auth_bp.get("/me")
@jwt_required()
def me():
    user = User.query.filter_by(id=get_jwt_identity()).first()
    if not user:
        return error_response("user not found", 404)

    return success_response(
        {
            "user_id": user.id,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role.name,
            },
        }
    )


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    user_id = get_jwt_identity()
    refresh_jti = get_jwt().get("jti", "")
    try:
        payload = AuthService.refresh(user_id=user_id, refresh_jti=refresh_jti)
    except ValueError as exc:
        return error_response(str(exc), 401)

    return success_response(
        {
            "access_token": payload["access_token"],
            "refresh_token": payload["refresh_token"],
            "user": {
                "id": payload["user"].id,
                "username": payload["user"].username,
                "email": payload["user"].email,
                "role": payload["user"].role.name,
            },
        }
    )


@auth_bp.post("/logout")
@jwt_required(refresh=True)
def logout():
    user_id = get_jwt_identity()
    refresh_jti = get_jwt().get("jti", "")
    AuthService.revoke_refresh_session(user_id=user_id, refresh_jti=refresh_jti)
    return success_response({"ok": True})
