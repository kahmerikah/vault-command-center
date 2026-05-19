from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class WebhookEvent(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "webhook_events"

    provider = db.Column(db.String(32), nullable=False, default="stripe", index=True)
    event_id = db.Column(db.String(128), nullable=False, unique=True, index=True)
    event_type = db.Column(db.String(128), nullable=False, index=True)
    livemode = db.Column(db.Boolean, default=False, nullable=False)
    status = db.Column(db.String(32), default="received", nullable=False, index=True)
    payload = db.Column(db.JSON, nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    processed_at = db.Column(db.DateTime, nullable=True)
