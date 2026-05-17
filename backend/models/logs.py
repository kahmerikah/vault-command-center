from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class AuditLog(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "audit_logs"

    actor_id = db.Column(db.String(36), nullable=True)
    action = db.Column(db.String(64), nullable=False)
    entity_type = db.Column(db.String(64), nullable=False)
    entity_id = db.Column(db.String(64), nullable=False)
    before_state = db.Column(db.JSON, nullable=True)
    after_state = db.Column(db.JSON, nullable=True)


class ActivityLog(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "activity_logs"

    actor_id = db.Column(db.String(36), nullable=True)
    level = db.Column(db.String(16), default="info", nullable=False)
    message = db.Column(db.String(255), nullable=False)
    metadata = db.Column(db.JSON, nullable=True)
