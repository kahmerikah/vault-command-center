from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from backend.engine.runtime import get_engine_runtime
from backend.middleware.auth import require_roles
from backend.models.engine import EngineEvent, WorkflowRun
from backend.utils.responses import error_response, success_response


engine_bp = Blueprint("engine", __name__)


@engine_bp.get("/status")
@jwt_required()
def engine_status():
    runtime = get_engine_runtime()
    return success_response(runtime.runtime_snapshot())


@engine_bp.get("/modules")
@jwt_required()
def engine_modules():
    runtime = get_engine_runtime()
    include_disabled = request.args.get("include_disabled", "true").lower() == "true"
    return success_response({"items": runtime.modules.all(include_disabled=include_disabled)})


@engine_bp.get("/workflows")
@jwt_required()
def engine_workflows():
    runtime = get_engine_runtime()
    return success_response({"items": runtime.workflows.list()})


@engine_bp.post("/workflows/<workflow_key>/run")
@jwt_required()
@require_roles("super_admin", "admin", "moderator")
def run_workflow(workflow_key):
    runtime = get_engine_runtime()
    payload = request.get_json(silent=True) or {}
    payload["actor_id"] = get_jwt_identity()

    try:
        result = runtime.workflows.run(workflow_key=workflow_key, payload=payload)
    except ValueError as exc:
        return error_response(str(exc), 404)

    return success_response(result)


@engine_bp.post("/events/<event_name>")
@jwt_required()
@require_roles("super_admin", "admin", "moderator")
def emit_engine_event(event_name):
    runtime = get_engine_runtime()
    payload = request.get_json(silent=True) or {}
    payload["actor_id"] = get_jwt_identity()
    runtime.events.emit(event_name, payload)
    return success_response({"emitted": True, "event_name": event_name})


@engine_bp.get("/events")
@jwt_required()
def list_engine_events():
    page = max(int(request.args.get("page", 1)), 1)
    limit = min(max(int(request.args.get("limit", 20)), 1), 100)
    module_key = (request.args.get("module") or "").strip()
    event_name = (request.args.get("event") or "").strip()

    query = EngineEvent.query.order_by(EngineEvent.created_at.desc())
    if module_key:
        query = query.filter_by(module_key=module_key)
    if event_name:
        query = query.filter_by(event_name=event_name)

    paged = query.paginate(page=page, per_page=limit, error_out=False)
    return success_response(
        {
            "items": [
                {
                    "id": event.id,
                    "event_name": event.event_name,
                    "module_key": event.module_key,
                    "actor_id": event.actor_id,
                    "payload": event.payload,
                    "status": event.status,
                    "created_at": event.created_at.isoformat(),
                }
                for event in paged.items
            ],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": paged.total,
                "pages": paged.pages,
            },
        }
    )


@engine_bp.get("/workflow-runs")
@jwt_required()
def workflow_runs():
    page = max(int(request.args.get("page", 1)), 1)
    limit = min(max(int(request.args.get("limit", 20)), 1), 100)

    paged = WorkflowRun.query.order_by(WorkflowRun.created_at.desc()).paginate(page=page, per_page=limit, error_out=False)
    return success_response(
        {
            "items": [
                {
                    "id": run.id,
                    "workflow_key": run.workflow_key,
                    "module_key": run.module_key,
                    "trigger_event": run.trigger_event,
                    "actor_id": run.actor_id,
                    "status": run.status,
                    "input_payload": run.input_payload,
                    "output_payload": run.output_payload,
                    "error_message": run.error_message,
                    "created_at": run.created_at.isoformat(),
                }
                for run in paged.items
            ],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": paged.total,
                "pages": paged.pages,
            },
        }
    )


@engine_bp.get("/services")
@jwt_required()
def service_discovery():
    runtime = get_engine_runtime()
    return success_response(runtime.discovery.discover())
