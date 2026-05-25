from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class EngineEvent(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "engine_events"

    event_name = db.Column(db.String(140), nullable=False, index=True)
    module_key = db.Column(db.String(64), nullable=True, index=True)
    actor_id = db.Column(db.String(36), nullable=True, index=True)
    payload = db.Column(db.JSON, nullable=False, default=dict)
    status = db.Column(db.String(24), nullable=False, default="processed")


class WorkflowRun(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "workflow_runs"

    workflow_key = db.Column(db.String(140), nullable=False, index=True)
    module_key = db.Column(db.String(64), nullable=True, index=True)
    trigger_event = db.Column(db.String(140), nullable=True, index=True)
    actor_id = db.Column(db.String(36), nullable=True, index=True)
    status = db.Column(db.String(24), nullable=False, default="completed")
    input_payload = db.Column(db.JSON, nullable=False, default=dict)
    output_payload = db.Column(db.JSON, nullable=True)
    error_message = db.Column(db.Text, nullable=True)
