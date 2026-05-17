from uuid import uuid4
from flask import g, request


def request_context_middleware(app):
    @app.before_request
    def _before_request():
        # Request IDs make logs and audit records traceable across services.
        g.request_id = request.headers.get("X-Request-ID") or str(uuid4())
