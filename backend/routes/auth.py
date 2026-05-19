from flask import Blueprint, current_app, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from backend.services.auth_service import AuthService
from backend.models import Session, User
from backend.services.activity_service import ActivityService
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
        ActivityService.log(
            message=f"Failed login for identity: {identity}",
            level="warning",
            meta={"ip": request.remote_addr or "", "identity": identity},
        )
        return error_response(str(exc), 401)

    ActivityService.log(
        message=f"Successful login: {payload['user'].username}",
        actor_id=payload["user"].id,
        meta={"ip": request.remote_addr or ""},
    )

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


@auth_bp.get("/sessions")
@jwt_required()
def sessions():
    user_id = get_jwt_identity()
    rows = Session.query.filter_by(user_id=user_id).order_by(Session.created_at.desc()).limit(25).all()
    return success_response(
        {
            "items": [
                {
                    "id": row.id,
                    "user_agent": row.user_agent,
                    "ip_address": row.ip_address,
                    "is_revoked": row.is_revoked,
                    "created_at": row.created_at.isoformat(),
                }
                for row in rows
            ]
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


@auth_bp.post("/forgot-password")
def forgot_password():
    data = request.get_json(silent=True) or {}
    identity = (data.get("identity") or "").strip()
    if not identity:
        return error_response("identity is required", 400)

    token = AuthService.issue_password_reset_token(
        identity=identity,
        secret_key=current_app.config["SECRET_KEY"],
    )

    return success_response(
        {
            "message": "if the account exists, a reset token has been issued",
            "reset_token": token,
        }
    )


@auth_bp.post("/reset-password")
def reset_password():
    data = request.get_json(silent=True) or {}
    reset_token = data.get("reset_token") or ""
    new_password = data.get("new_password") or ""

    if len(new_password) < 12:
        return error_response("password must be at least 12 characters", 400)
    if not reset_token:
        return error_response("reset_token is required", 400)

    try:
        user = AuthService.reset_password_with_token(
            reset_token=reset_token,
            new_password=new_password,
            secret_key=current_app.config["SECRET_KEY"],
            max_age_seconds=current_app.config["PASSWORD_RESET_TOKEN_EXP_SECONDS"],
        )
    except ValueError as exc:
        return error_response(str(exc), 400)

    return success_response({"id": user.id, "username": user.username, "email": user.email})


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
