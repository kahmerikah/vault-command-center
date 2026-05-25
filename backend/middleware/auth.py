from functools import wraps
from flask_jwt_extended import get_jwt, verify_jwt_in_request
from backend.models import Role, User
from backend.utils.responses import error_response


def require_roles(*allowed_roles):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            role = claims.get("role", "guest")
            if allowed_roles and role not in allowed_roles:
                return error_response("insufficient permissions", 403)
            return func(*args, **kwargs)

        return wrapper

    return decorator


def _resolve_permission_codes(claims: dict, user_id: str | None) -> set[str]:
    claim_permissions = claims.get("permissions") or []
    if claim_permissions:
        return set(claim_permissions)

    if not user_id:
        return set()

    user = User.query.filter_by(id=user_id).first()
    if not user:
        return set()

    role = Role.query.filter_by(id=user.role_id).first()
    if not role:
        return set()

    return {perm.code for perm in role.permissions}


def require_permissions(*required_permissions):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get("role") == "super_admin":
                return func(*args, **kwargs)

            user_id = claims.get("sub")
            permission_codes = _resolve_permission_codes(claims, user_id=user_id)
            missing = [code for code in required_permissions if code not in permission_codes]
            if missing:
                return error_response("insufficient permissions", 403)

            return func(*args, **kwargs)

        return wrapper

    return decorator
