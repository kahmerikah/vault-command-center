from uuid import uuid4
from flask import g, request
from flask_jwt_extended import get_jwt, verify_jwt_in_request


def request_context_middleware(app):
    @app.before_request
    def _before_request():
        # Request IDs make logs and audit records traceable across services.
        g.request_id = request.headers.get("X-Request-ID") or str(uuid4())

        user_id = None
        claims = {}
        try:
            verify_jwt_in_request(optional=True)
            claims = get_jwt() or {}
            user_id = claims.get("sub")
        except Exception:
            claims = {}

        path_parts = [part for part in request.path.split("/") if part]
        active_module = None
        if len(path_parts) >= 3 and path_parts[0] == "api":
            candidate = path_parts[2]
            if candidate not in {"engine", "gateway", "auth", "dashboard", "ops"}:
                active_module = candidate

        g.engine_context = {
            "request_id": g.request_id,
            "active_user": user_id,
            "active_org": request.headers.get("X-Org-Id"),
            "active_module": active_module,
            "permissions": claims.get("permissions") or [],
            "role": claims.get("role"),
        }
