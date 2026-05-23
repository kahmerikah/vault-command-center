"""Shared engine persistence models for the SOMB runtime layer."""
from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class EngineEvent(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "engine_events"

    event_name = db.Column(db.String(128), nullable=False, index=True)
    source_module = db.Column(db.String(64), nullable=True, index=True)
    actor_id = db.Column(db.String(36), nullable=True, index=True)
    correlation_id = db.Column(db.String(64), nullable=True, index=True)
    payload = db.Column(db.JSON, nullable=True)
    status = db.Column(db.String(32), default="recorded", nullable=False, index=True)


class WorkflowDefinition(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "workflow_definitions"

    key = db.Column(db.String(128), unique=True, nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text, nullable=True)
    trigger_event = db.Column(db.String(128), nullable=False, index=True)
    module_key = db.Column(db.String(64), nullable=True, index=True)
    conditions = db.Column(db.JSON, nullable=True)
    actions = db.Column(db.JSON, nullable=True)
    is_enabled = db.Column(db.Boolean, default=True, nullable=False)


class WorkflowRun(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "workflow_runs"

    workflow_id = db.Column(db.String(36), db.ForeignKey("workflow_definitions.id"), nullable=False, index=True)
    trigger_event = db.Column(db.String(128), nullable=False, index=True)
    actor_id = db.Column(db.String(36), nullable=True, index=True)
    correlation_id = db.Column(db.String(64), nullable=True, index=True)
    status = db.Column(db.String(32), default="queued", nullable=False, index=True)
    input_payload = db.Column(db.JSON, nullable=True)
    output_payload = db.Column(db.JSON, nullable=True)
    error_payload = db.Column(db.JSON, nullable=True)
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)

    workflow = db.relationship("WorkflowDefinition", backref=db.backref("runs", lazy="dynamic"))


class EnginePlugin(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "engine_plugins"

    key = db.Column(db.String(128), unique=True, nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    version = db.Column(db.String(32), nullable=True)
    manifest_path = db.Column(db.String(255), nullable=False)
    route_prefix = db.Column(db.String(128), nullable=True)
    permissions = db.Column(db.JSON, nullable=True)
    websocket_events = db.Column(db.JSON, nullable=True)
    uses = db.Column(db.JSON, nullable=True)
    is_enabled = db.Column(db.Boolean, default=True, nullable=False)
