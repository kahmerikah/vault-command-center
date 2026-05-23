"""Shared runtime engine service for module discovery, events, workflows, and context."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from flask import current_app, has_app_context

from backend.extensions import db, socketio
from backend.models import ActivityLog, Notification, RegisteredModule, SystemState, User
from backend.models.engine import EngineEvent, EnginePlugin, WorkflowDefinition, WorkflowRun
from backend.services.activity_service import ActivityService
from backend.services.notification_service import NotificationService
from backend.models.blockchain import Wallet
from backend.models.booking import Booking
from backend.models.financial import FinancialAccount, PlaidTransaction, RoutingEvent
from backend.models.knowledge import KnowledgeEntry
from backend.models.membership import Membership
from backend.models.logs import AuditLog
from backend.models.property import Property


class EngineService:
    """Shared runtime layer for SOMB modules and future apps."""

    DEFAULT_SEARCH_PATHS = ("modules",)

    @staticmethod
    def bootstrap(module_roots: tuple[str, ...] | None = None) -> list[dict[str, Any]]:
        roots = module_roots or EngineService.DEFAULT_SEARCH_PATHS
        registered: list[dict[str, Any]] = []
        for root in roots:
            registered.extend(EngineService.discover_modules(root))
        return registered

    @staticmethod
    def discover_modules(root_path: str) -> list[dict[str, Any]]:
        root = Path(root_path)
        if not root.exists():
            # Allow running from repo root or app package root.
            if has_app_context():
                app_root = Path(current_app.root_path).parent / root_path
                root = app_root if app_root.exists() else root
            else:
                cwd_root = Path.cwd() / root_path
                root = cwd_root if cwd_root.exists() else root
        if not root.exists():
            return []

        registered: list[dict[str, Any]] = []
        with current_app.app_context():
            for module_dir in sorted([p for p in root.iterdir() if p.is_dir()]):
                manifest = module_dir / "module.json"
                if not manifest.exists():
                    continue
                try:
                    payload = json.loads(manifest.read_text(encoding="utf-8"))
                except Exception:
                    continue

                row = RegisteredModule.query.filter_by(key=payload["key"]).first()
                if not row:
                    row = RegisteredModule(
                        key=payload["key"],
                        name=payload.get("name", payload["key"]),
                        description=payload.get("description", ""),
                        route_prefix=payload.get("route_prefix", f"/api/v1/{payload['key']}"),
                        is_enabled=payload.get("is_enabled", True),
                    )
                    db.session.add(row)
                else:
                    row.name = payload.get("name", row.name)
                    row.description = payload.get("description", row.description)
                    row.route_prefix = payload.get("route_prefix", row.route_prefix)
                    row.is_enabled = payload.get("is_enabled", row.is_enabled)

                row.manifest_path = str(manifest)
                row.permissions = payload.get("permissions", [])
                row.websocket_events = payload.get("websocket_events", [])
                row.uses = payload.get("uses", [])
                row.manifest = payload
                row.version = payload.get("version")

                registered.append(EngineService._serialize_module(row))

            db.session.commit()
        return registered

    @staticmethod
    def list_modules() -> list[dict[str, Any]]:
        rows = RegisteredModule.query.order_by(RegisteredModule.name.asc()).all()
        return [EngineService._serialize_module(row) for row in rows]

    @staticmethod
    def _serialize_module(row: RegisteredModule) -> dict[str, Any]:
        return {
            "key": row.key,
            "name": row.name,
            "description": row.description,
            "route_prefix": row.route_prefix,
            "is_enabled": row.is_enabled,
            "permissions": row.permissions or [],
            "websocket_events": row.websocket_events or [],
            "uses": row.uses or [],
            "manifest": row.manifest or {},
            "version": row.version,
        }

    @staticmethod
    def publish_event(
        event_name: str,
        payload: dict[str, Any] | None = None,
        *,
        actor_id: str | None = None,
        source_module: str | None = None,
        correlation_id: str | None = None,
        persist: bool = True,
        broadcast: bool = True,
    ) -> EngineEvent:
        payload = payload or {}
        event = EngineEvent(
            event_name=event_name,
            source_module=source_module,
            actor_id=actor_id,
            correlation_id=correlation_id or uuid4().hex,
            payload=payload,
            status="recorded",
        )
        db.session.add(event)
        db.session.flush()

        if broadcast:
            socketio.emit(
                "engine:event",
                {
                    "id": event.id,
                    "event_name": event.event_name,
                    "source_module": event.source_module,
                    "actor_id": event.actor_id,
                    "correlation_id": event.correlation_id,
                    "payload": event.payload or {},
                    "created_at": event.created_at.isoformat(),
                },
                room="engine",
            )
            socketio.emit(event_name, payload, room="engine")

        if persist:
            EngineService._run_event_workflows(event)

        db.session.commit()
        return event

    @staticmethod
    def _run_event_workflows(event: EngineEvent):
        workflows = WorkflowDefinition.query.filter_by(trigger_event=event.event_name, is_enabled=True).all()
        for workflow in workflows:
            run = WorkflowRun(
                workflow_id=workflow.id,
                trigger_event=event.event_name,
                actor_id=event.actor_id,
                correlation_id=event.correlation_id,
                status="running",
                input_payload=event.payload,
                started_at=datetime.utcnow(),
            )
            db.session.add(run)
            db.session.flush()

            try:
                output = EngineService._execute_actions(workflow.actions or [], event, workflow)
                run.status = "completed"
                run.output_payload = output
                run.completed_at = datetime.utcnow()
            except Exception as exc:  # pragma: no cover - defensive orchestration path
                run.status = "failed"
                run.error_payload = {"error": str(exc)}
                run.completed_at = datetime.utcnow()

    @staticmethod
    def _execute_actions(actions: list[dict[str, Any]], event: EngineEvent, workflow: WorkflowDefinition) -> dict[str, Any]:
        output: dict[str, Any] = {"executed": []}
        for action in actions:
            action_type = (action.get("type") or "").strip().lower()
            if action_type == "log_activity":
                ActivityService.log(
                    message=action.get("message") or f"Workflow {workflow.key} handled {event.event_name}",
                    actor_id=event.actor_id,
                    meta={"workflow_key": workflow.key, "event_name": event.event_name},
                )
                output["executed"].append(action_type)
            elif action_type == "notify":
                NotificationService.create(
                    user_id=action.get("user_id") or event.actor_id,
                    title=action.get("title") or workflow.name,
                    body=action.get("body") or f"Triggered by {event.event_name}",
                )
                output["executed"].append(action_type)
            elif action_type == "broadcast":
                socketio.emit(action.get("event_name") or event.event_name, action.get("payload") or event.payload or {}, room=action.get("room") or "engine")
                output["executed"].append(action_type)
            elif action_type == "set_state":
                key = action.get("key") or f"workflow:{workflow.key}"
                state = SystemState.query.filter_by(key=key).first()
                if state:
                    state.value = action.get("value")
                else:
                    db.session.add(SystemState(key=key, value=action.get("value")))
                output["executed"].append(action_type)
            elif action_type == "audit":
                db.session.add(
                    AuditLog(
                        actor_id=event.actor_id,
                        action=action.get("action") or "workflow_event",
                        entity_type=action.get("entity_type") or "engine",
                        entity_id=action.get("entity_id") or event.id,
                        before_state=action.get("before_state"),
                        after_state=action.get("after_state") or event.payload,
                    )
                )
                output["executed"].append(action_type)
        return output

    @staticmethod
    def get_context(user_id: str) -> dict[str, Any]:
        user = User.query.filter_by(id=user_id).first()
        membership = Membership.query.filter_by(user_id=user_id).first()
        wallet = Wallet.query.filter_by(user_id=user_id).first()

        upcoming_bookings = Booking.query.filter_by(user_id=user_id).order_by(Booking.starts_at.asc()).limit(5).all()
        recent_notifications = Notification.query.filter_by(user_id=user_id).order_by(Notification.created_at.desc()).limit(5).all()
        recent_activity = ActivityLog.query.filter_by(actor_id=user_id).order_by(ActivityLog.created_at.desc()).limit(5).all()
        recent_entities = KnowledgeEntry.query.filter_by(user_id=user_id).order_by(KnowledgeEntry.updated_at.desc()).limit(5).all()
        active_workflows = WorkflowDefinition.query.filter_by(is_enabled=True).order_by(WorkflowDefinition.updated_at.desc()).limit(8).all()
        modules = RegisteredModule.query.filter_by(is_enabled=True).order_by(RegisteredModule.name.asc()).all()

        return {
            "active_user": EngineService._serialize_user(user),
            "active_membership": EngineService._serialize_membership(membership, wallet),
            "active_organization": {
                "key": "personal",
                "name": "SOMB Vault",
                "mode": "personal_os",
            },
            "active_workflows": [EngineService._serialize_workflow(w) for w in active_workflows],
            "active_tasks": [
                {"id": b.id, "title": b.title or b.module_key, "kind": b.event_type or "booking", "starts_at": b.starts_at.isoformat()}
                for b in upcoming_bookings
            ],
            "recent_entities": [
                {"kind": "knowledge", "id": e.id, "title": e.title, "url": "/knowledge"}
                for e in recent_entities
            ],
            "command_history": EngineService._command_history(user_id),
            "notifications": [
                {"id": n.id, "title": n.title, "body": n.body, "created_at": n.created_at.isoformat()}
                for n in recent_notifications
            ],
            "realtime_activity": [
                {"id": a.id, "level": a.level, "message": a.message, "created_at": a.created_at.isoformat()}
                for a in recent_activity
            ],
            "modules": [EngineService._serialize_module(m) for m in modules],
        }

    @staticmethod
    def _serialize_user(user: User | None) -> dict[str, Any] | None:
        if not user:
            return None
        return {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "is_verified": user.is_verified,
            "is_active": user.is_active,
        }

    @staticmethod
    def _serialize_membership(membership: Membership | None, wallet: Wallet | None) -> dict[str, Any] | None:
        if not membership:
            return None
        return {
            "id": membership.id,
            "tier": membership.tier,
            "status": membership.status,
            "token_balance": str(membership.token_balance),
            "wallet_id": membership.wallet_id or (wallet.id if wallet else None),
        }

    @staticmethod
    def _serialize_workflow(workflow: WorkflowDefinition) -> dict[str, Any]:
        return {
            "id": workflow.id,
            "key": workflow.key,
            "name": workflow.name,
            "trigger_event": workflow.trigger_event,
            "module_key": workflow.module_key,
            "is_enabled": workflow.is_enabled,
            "conditions": workflow.conditions or {},
            "actions": workflow.actions or [],
        }

    @staticmethod
    def _command_history(user_id: str) -> list[dict[str, Any]]:
        rows = EngineEvent.query.filter_by(actor_id=user_id).order_by(EngineEvent.created_at.desc()).limit(10).all()
        return [
            {
                "id": row.id,
                "event_name": row.event_name,
                "source_module": row.source_module,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]

    @staticmethod
    def health() -> dict[str, Any]:
        return {
            "engine": "online",
            "registered_modules": RegisteredModule.query.count(),
            "engine_events": EngineEvent.query.count(),
            "workflow_definitions": WorkflowDefinition.query.count(),
            "workflow_runs": WorkflowRun.query.count(),
        }

    @staticmethod
    def register_workflow(
        key: str,
        name: str,
        trigger_event: str,
        *,
        module_key: str | None = None,
        description: str | None = None,
        conditions: dict[str, Any] | None = None,
        actions: list[dict[str, Any]] | None = None,
        is_enabled: bool = True,
    ) -> WorkflowDefinition:
        workflow = WorkflowDefinition.query.filter_by(key=key).first()
        if not workflow:
            workflow = WorkflowDefinition(
                key=key,
                name=name,
                trigger_event=trigger_event,
                module_key=module_key,
                description=description,
                conditions=conditions or {},
                actions=actions or [],
                is_enabled=is_enabled,
            )
            db.session.add(workflow)
        else:
            workflow.name = name
            workflow.trigger_event = trigger_event
            workflow.module_key = module_key
            workflow.description = description
            workflow.conditions = conditions or {}
            workflow.actions = actions or []
            workflow.is_enabled = is_enabled
        db.session.commit()
        return workflow
