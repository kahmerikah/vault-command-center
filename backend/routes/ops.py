from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from backend.extensions import socketio
from backend.middleware.auth import require_roles
from backend.models import ActivityLog
from backend.services.activity_service import ActivityService
from backend.services.system_sync_service import SystemSyncService
from backend.services.terminal_service import TerminalService
from backend.utils.responses import error_response, success_response

ops_bp = Blueprint("ops", __name__)


@ops_bp.get("/terminal/commands")
@jwt_required()
def terminal_commands():
    return success_response({"items": TerminalService.allowed_commands()})


@ops_bp.get("/terminal/history")
@jwt_required()
def terminal_history():
    limit = min(max(int(request.args.get("limit", 40)), 1), 200)
    rows = ActivityLog.query.order_by(ActivityLog.created_at.desc()).limit(limit).all()
    return success_response(
        {
            "items": [
                {
                    "id": row.id,
                    "level": row.level,
                    "message": row.message,
                    "created_at": row.created_at.isoformat(),
                }
                for row in rows
            ]
        }
    )


@ops_bp.post("/terminal/dispatch")
@jwt_required()
@require_roles("super_admin", "admin", "moderator")
def dispatch_terminal_command():
    payload = request.get_json(silent=True) or {}
    command = (payload.get("command") or "").strip()
    if not command:
        return error_response("command is required", 400)

    lines = TerminalService.dispatch(command)
    actor_id = get_jwt_identity()
    ActivityService.log(
        message=f"Terminal command executed: {command}",
        actor_id=actor_id,
        meta={"command": command, "lines": len(lines)},
    )

    for line in lines:
        socketio.emit("terminal:line", {"line": line, "command": command}, room="ops")

    return success_response({"command": command, "lines": lines})


@ops_bp.post("/system/pull-and-sync")
@jwt_required()
@require_roles("super_admin", "admin")
def pull_and_sync_system():
    actor_id = get_jwt_identity()
    result = SystemSyncService.pull_and_sync_env()
    if not result.get("ok", False):
        ActivityService.log(
            message="System pull-and-sync failed",
            actor_id=actor_id,
            level="warning",
            meta={"error": result.get("error")},
        )
        return error_response(result.get("error", "pull-and-sync failed"), 400)
    ActivityService.log(
        message="System pull-and-sync executed",
        actor_id=actor_id,
        meta={
            "head": (result.get("git") or {}).get("head"),
            "added_env_keys": ((result.get("env_sync") or {}).get("added_keys") or []),
        },
    )
    return success_response(result)
