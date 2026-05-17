from flask import Blueprint
from backend.models import RegisteredModule
from backend.utils.responses import success_response

modules_bp = Blueprint("modules", __name__)


@modules_bp.get("")
def list_modules():
    rows = RegisteredModule.query.order_by(RegisteredModule.name.asc()).all()
    return success_response(
        {
            "items": [
                {
                    "key": m.key,
                    "name": m.name,
                    "description": m.description,
                    "route_prefix": m.route_prefix,
                    "is_enabled": m.is_enabled,
                }
                for m in rows
            ]
        }
    )
