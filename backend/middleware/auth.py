from functools import wraps
from flask_jwt_extended import get_jwt, verify_jwt_in_request
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
