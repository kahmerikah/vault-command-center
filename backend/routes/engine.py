"""Engine routes exposing shared runtime context, registry, workflows, and health."""
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from backend.services.engine_service import EngineService
from backend.utils.responses import error_response, success_response

engine_bp = Blueprint("engine", __name__)


@engine_bp.get("/health")
@jwt_required()
def engine_health():
    return success_response(EngineService.health())


@engine_bp.get("/modules")
@jwt_required()
def engine_modules():
    return success_response({"items": EngineService.list_modules()})


@engine_bp.get("/context")
@jwt_required()
def engine_context():
    return success_response(EngineService.get_context(get_jwt_identity()))


@engine_bp.get("/events")
@jwt_required()
def engine_events():
    from backend.models.engine import EngineEvent

    limit = min(max(int(request.args.get("limit", 30)), 1), 100)
    rows = EngineEvent.query.order_by(EngineEvent.created_at.desc()).limit(limit).all()
    return success_response(
        {
            "items": [
                {
                    "id": row.id,
                    "event_name": row.event_name,
                    "source_module": row.source_module,
                    "actor_id": row.actor_id,
                    "correlation_id": row.correlation_id,
                    "payload": row.payload or {},
                    "status": row.status,
                    "created_at": row.created_at.isoformat(),
                }
                for row in rows
            ]
        }
    )


@engine_bp.get("/workflows")
@jwt_required()
def engine_workflows():
    from backend.models.engine import WorkflowDefinition

    rows = WorkflowDefinition.query.order_by(WorkflowDefinition.updated_at.desc()).all()
    return success_response(
        {
            "items": [
                {
                    "id": row.id,
                    "key": row.key,
                    "name": row.name,
                    "trigger_event": row.trigger_event,
                    "module_key": row.module_key,
                    "description": row.description,
                    "is_enabled": row.is_enabled,
                    "conditions": row.conditions or {},
                    "actions": row.actions or [],
                }
                for row in rows
            ]
        }
    )


@engine_bp.post("/workflows")
@jwt_required()
def create_workflow():
    payload = request.get_json(silent=True) or {}
    key = (payload.get("key") or "").strip()
    name = (payload.get("name") or "").strip()
    trigger_event = (payload.get("trigger_event") or "").strip()
    if not key or not name or not trigger_event:
        return error_response("key, name, and trigger_event are required", 400)

    workflow = EngineService.register_workflow(
        key=key,
        name=name,
        trigger_event=trigger_event,
        module_key=payload.get("module_key"),
        description=payload.get("description"),
        conditions=payload.get("conditions") or {},
        actions=payload.get("actions") or [],
        is_enabled=payload.get("is_enabled", True),
    )
    return success_response({"id": workflow.id, "key": workflow.key}, 201)


@engine_bp.post("/events/publish")
@jwt_required()
def publish_event():
    payload = request.get_json(silent=True) or {}
    event_name = (payload.get("event_name") or "").strip()
    if not event_name:
        return error_response("event_name is required", 400)

    event = EngineService.publish_event(
        event_name,
        payload.get("payload") or {},
        actor_id=get_jwt_identity(),
        source_module=payload.get("source_module"),
        correlation_id=payload.get("correlation_id"),
    )
    return success_response({"id": event.id, "event_name": event.event_name}, 201)
