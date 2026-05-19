from flask import Blueprint
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.models import RegisteredModule
from backend.services.activity_service import ActivityService
from backend.utils.responses import success_response

modules_bp = Blueprint("modules", __name__)


@modules_bp.get("")
@jwt_required()
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


@modules_bp.post("/<module_key>/launch")
@jwt_required()
def launch_module(module_key):
    module = RegisteredModule.query.filter_by(key=module_key, is_enabled=True).first()
    if not module:
        return success_response({"launched": False, "reason": "module unavailable"}, 404)

    ActivityService.log(
        message=f"Module launched: {module.name}",
        actor_id=get_jwt_identity(),
        meta={"module_key": module.key, "route_prefix": module.route_prefix},
    )
    return success_response(
        {
            "launched": True,
            "module": {
                "key": module.key,
                "name": module.name,
                "route_prefix": module.route_prefix,
            },
        }
    )
