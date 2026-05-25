from flask import Blueprint
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.engine.runtime import get_engine_runtime
from backend.services.activity_service import ActivityService
from backend.utils.responses import success_response

modules_bp = Blueprint("modules", __name__)


@modules_bp.get("")
@jwt_required()
def list_modules():
    runtime = get_engine_runtime()
    rows = runtime.modules.all(include_disabled=True)
    return success_response(
        {
            "items": [
                {
                    "key": m["key"],
                    "name": m["name"],
                    "description": m["description"],
                    "route_prefix": m["api_prefix"],
                    "is_enabled": m["is_enabled"],
                    "events": m["events"],
                    "permissions": m["permissions"],
                    "uses": m["uses"],
                }
                for m in rows
            ]
        }
    )


@modules_bp.post("/<module_key>/launch")
@jwt_required()
def launch_module(module_key):
    runtime = get_engine_runtime()
    module = runtime.modules.get(module_key)
    if module and not module.get("is_enabled"):
        module = None

    if not module:
        return success_response({"launched": False, "reason": "module unavailable"}, 404)

    runtime.events.emit(
        "module.launched",
        {
            "module_key": module["key"],
            "actor_id": get_jwt_identity(),
            "api_prefix": module["api_prefix"],
        },
    )

    ActivityService.log(
        message=f"Module launched: {module['name']}",
        actor_id=get_jwt_identity(),
        meta={"module_key": module["key"], "route_prefix": module["api_prefix"]},
    )
    return success_response(
        {
            "launched": True,
            "module": {
                "key": module["key"],
                "name": module["name"],
                "route_prefix": module["api_prefix"],
            },
        }
    )
