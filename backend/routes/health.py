from flask import Blueprint
from backend.utils.responses import success_response

health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health_check():
    return success_response({"service": "The SOMB Vault", "status": "ok"})
