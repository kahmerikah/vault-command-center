from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from flask import current_app

from backend.extensions import db, socketio
from backend.models import ActivityLog, Permission, RegisteredModule, SystemState
from backend.models.engine import EngineEvent, WorkflowRun


EventHandler = Callable[[dict[str, Any]], None]


@dataclass
class WorkflowDefinition:
    key: str
    trigger: str
    module_key: str | None = None
    name: str | None = None
    conditions: list[dict[str, Any]] = field(default_factory=list)
    actions: list[dict[str, Any]] = field(default_factory=list)


class StatePersistenceLayer:
    def get(self, key: str, default: Any = None) -> Any:
        row = SystemState.query.filter_by(key=key).first()
        if not row:
            return default
        return row.value

    def set(self, key: str, value: Any) -> Any:
        row = SystemState.query.filter_by(key=key).first()
        if row:
            row.value = value
        else:
            row = SystemState(key=key, value=value)
            db.session.add(row)
        db.session.commit()
        return row.value


class ModuleRegistryEngine:
    def __init__(self):
        self._manifests: dict[str, dict[str, Any]] = {}

    def _normalize_manifest(self, payload: dict[str, Any], module_dir: Path | None = None) -> dict[str, Any]:
        key = (payload.get("key") or "").strip()
        if not key:
            raise ValueError("module manifest missing key")

        api_prefix = (payload.get("api_prefix") or payload.get("route_prefix") or f"/api/v1/{key}").strip()
        routes = payload.get("routes") or [f"/{key}"]
        events = payload.get("events") or payload.get("websocket_events") or []
        permissions = payload.get("permissions") or []
        uses = payload.get("uses") or []
        workflows = payload.get("workflows") or []

        return {
            "key": key,
            "name": payload.get("name", key),
            "description": payload.get("description", ""),
            "is_enabled": bool(payload.get("is_enabled", True)),
            "api_prefix": api_prefix,
            "route_prefix": api_prefix,
            "routes": routes,
            "permissions": permissions,
            "events": events,
            "uses": uses,
            "workflows": workflows,
            "module_path": str(module_dir) if module_dir else None,
            "raw": payload,
        }

    def bootstrap_from_manifests(self, modules_root: str):
        root = Path(modules_root)
        if not root.exists():
            return

        manifests: dict[str, dict[str, Any]] = {}
        for module_dir in root.iterdir():
            manifest_file = module_dir / "module.json"
            if not manifest_file.exists():
                continue

            payload = json.loads(manifest_file.read_text(encoding="utf-8"))
            manifest = self._normalize_manifest(payload, module_dir=module_dir)
            manifests[manifest["key"]] = manifest

        self._manifests = manifests
        self._persist_manifest_state()

    def _persist_manifest_state(self):
        for manifest in self._manifests.values():
            current = RegisteredModule.query.filter_by(key=manifest["key"]).first()
            if current:
                current.name = manifest["name"]
                current.description = manifest["description"]
                current.route_prefix = manifest["api_prefix"]
                current.is_enabled = manifest["is_enabled"]
            else:
                db.session.add(
                    RegisteredModule(
                        key=manifest["key"],
                        name=manifest["name"],
                        description=manifest["description"],
                        route_prefix=manifest["api_prefix"],
                        is_enabled=manifest["is_enabled"],
                    )
                )

            for code in manifest["permissions"]:
                if not Permission.query.filter_by(code=code).first():
                    db.session.add(Permission(code=code, description=f"{manifest['name']} permission"))

        db.session.commit()

    def all(self, include_disabled: bool = True) -> list[dict[str, Any]]:
        items = list(self._manifests.values())
        if include_disabled:
            return sorted(items, key=lambda item: item["name"].lower())
        return sorted([item for item in items if item.get("is_enabled")], key=lambda item: item["name"].lower())

    def get(self, key: str) -> dict[str, Any] | None:
        return self._manifests.get(key)


class EventBusEngine:
    def __init__(self):
        self._handlers: dict[str, list[EventHandler]] = {}

    def subscribe(self, event_name: str, handler: EventHandler):
        handlers = self._handlers.setdefault(event_name, [])
        handlers.append(handler)

    def emit(self, event_name: str, payload: dict[str, Any] | None = None):
        payload = payload or {}

        event = EngineEvent(
            event_name=event_name,
            module_key=payload.get("module_key"),
            actor_id=payload.get("actor_id"),
            payload=payload,
        )
        db.session.add(event)
        db.session.commit()

        socketio.emit(
            "engine:event",
            {
                "event_name": event_name,
                "module_key": event.module_key,
                "actor_id": event.actor_id,
                "payload": payload,
                "created_at": event.created_at.isoformat(),
            },
            to="ops",
        )

        for handler in self._handlers.get(event_name, []):
            try:
                handler(payload)
            except Exception:
                current_app.logger.exception("engine event handler failed", extra={"event_name": event_name})


class WorkflowEngine:
    def __init__(self, event_bus: EventBusEngine, state: StatePersistenceLayer):
        self.event_bus = event_bus
        self.state = state
        self._workflows: dict[str, WorkflowDefinition] = {}

    def register(self, workflow: WorkflowDefinition):
        self._workflows[workflow.key] = workflow

    def register_manifest_workflows(self, modules: list[dict[str, Any]]):
        for module in modules:
            for item in module.get("workflows") or []:
                if not isinstance(item, dict):
                    continue

                key = item.get("key") or f"{module['key']}.{item.get('trigger', 'workflow')}"
                trigger = item.get("trigger")
                if not trigger:
                    continue

                workflow = WorkflowDefinition(
                    key=key,
                    name=item.get("name") or key,
                    trigger=trigger,
                    module_key=module["key"],
                    conditions=item.get("conditions") or [],
                    actions=item.get("actions") or [],
                )
                self.register(workflow)
                self.event_bus.subscribe(trigger, lambda payload, workflow_key=workflow.key: self.run(workflow_key, payload))

    def list(self) -> list[dict[str, Any]]:
        return [
            {
                "key": wf.key,
                "name": wf.name,
                "trigger": wf.trigger,
                "module_key": wf.module_key,
                "conditions": wf.conditions,
                "actions": wf.actions,
            }
            for wf in self._workflows.values()
        ]

    def run(self, workflow_key: str, payload: dict[str, Any] | None = None):
        payload = payload or {}
        workflow = self._workflows.get(workflow_key)
        if not workflow:
            raise ValueError("workflow not found")

        output = {
            "actions_executed": [],
            "state_updates": [],
        }
        status = "completed"
        error_message = None

        try:
            if not self._conditions_match(workflow.conditions, payload):
                status = "skipped"
            else:
                for action in workflow.actions:
                    result = self._execute_action(workflow, action, payload)
                    output["actions_executed"].append(result)
                    if result.get("type") == "set_state":
                        output["state_updates"].append(result)
        except Exception as exc:
            status = "failed"
            error_message = str(exc)

        run = WorkflowRun(
            workflow_key=workflow.key,
            module_key=workflow.module_key,
            trigger_event=workflow.trigger,
            actor_id=payload.get("actor_id"),
            status=status,
            input_payload=payload,
            output_payload=output,
            error_message=error_message,
        )
        db.session.add(run)

        if status == "completed":
            db.session.add(
                ActivityLog(
                    actor_id=payload.get("actor_id"),
                    level="info",
                    message=f"Workflow executed: {workflow.key}",
                    meta={"module_key": workflow.module_key, "actions": len(output["actions_executed"])},
                )
            )

        db.session.commit()
        return {
            "run_id": run.id,
            "workflow_key": workflow.key,
            "status": status,
            "output": output,
            "error": error_message,
        }

    def _conditions_match(self, conditions: list[dict[str, Any]], payload: dict[str, Any]) -> bool:
        for condition in conditions:
            field = condition.get("field")
            equals = condition.get("equals")
            if field is None:
                continue
            if payload.get(field) != equals:
                return False
        return True

    def _execute_action(self, workflow: WorkflowDefinition, action: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        action_type = action.get("type")
        if action_type == "emit_event":
            event_name = action.get("event")
            event_payload = dict(payload)
            event_payload.update(action.get("payload") or {})
            self.event_bus.emit(event_name, event_payload)
            return {"type": action_type, "event": event_name}

        if action_type == "set_state":
            key = action.get("key")
            value = action.get("value")
            if isinstance(value, str) and value == "$payload":
                value = payload
            self.state.set(key, value)
            return {"type": action_type, "key": key}

        if action_type == "log":
            message = action.get("message") or f"Workflow {workflow.key} action"
            db.session.add(
                ActivityLog(
                    actor_id=payload.get("actor_id"),
                    level="info",
                    message=message,
                    meta={"workflow_key": workflow.key, "module_key": workflow.module_key},
                )
            )
            db.session.commit()
            return {"type": action_type, "message": message}

        return {"type": action_type or "unknown", "skipped": True}


class RealtimeEngine:
    @staticmethod
    def broadcast(channel: str, payload: dict[str, Any]):
        socketio.emit(channel, payload)


class TelemetryEngine:
    @staticmethod
    def health_snapshot() -> dict[str, Any]:
        return {
            "activity_events": ActivityLog.query.count(),
            "engine_events": EngineEvent.query.count(),
            "workflow_runs": WorkflowRun.query.count(),
        }


class ServiceDiscoveryLayer:
    def __init__(self, module_registry: ModuleRegistryEngine):
        self.module_registry = module_registry

    def discover(self):
        modules = self.module_registry.all(include_disabled=False)
        return {
            "auth": {"service": "AuthService", "status": "online"},
            "permissions": {"service": "RBAC", "status": "online"},
            "wallets": {"service": "BlockchainService", "status": "online"},
            "payments": {"service": "PaymentsService", "status": "online"},
            "notifications": {"service": "NotificationService", "status": "online"},
            "modules": {
                "count": len(modules),
                "enabled": [module["key"] for module in modules],
            },
        }


class EngineRuntime:
    def __init__(self, app):
        self.app = app
        self.state = StatePersistenceLayer()
        self.modules = ModuleRegistryEngine()
        self.events = EventBusEngine()
        self.workflows = WorkflowEngine(event_bus=self.events, state=self.state)
        self.realtime = RealtimeEngine()
        self.telemetry = TelemetryEngine()
        self.discovery = ServiceDiscoveryLayer(module_registry=self.modules)

    def bootstrap(self, modules_root: str = "modules"):
        self.modules.bootstrap_from_manifests(modules_root=modules_root)
        self.workflows.register_manifest_workflows(self.modules.all(include_disabled=True))
        self.state.set(
            "engine.runtime",
            {
                "status": "online",
                "modules_enabled": [module["key"] for module in self.modules.all(include_disabled=False)],
            },
        )

    def runtime_snapshot(self) -> dict[str, Any]:
        return {
            "runtime": self.state.get("engine.runtime", {}),
            "modules": self.modules.all(include_disabled=True),
            "workflows": self.workflows.list(),
            "services": self.discovery.discover(),
            "telemetry": self.telemetry.health_snapshot(),
        }


_ENGINE_RUNTIME: EngineRuntime | None = None


def set_engine_runtime(runtime: EngineRuntime):
    global _ENGINE_RUNTIME
    _ENGINE_RUNTIME = runtime


def get_engine_runtime() -> EngineRuntime:
    if _ENGINE_RUNTIME is None:
        raise RuntimeError("Engine runtime not initialized")
    return _ENGINE_RUNTIME
