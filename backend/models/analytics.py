from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class AnalyticsEvent(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "analytics_events"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    module_key = db.Column(db.String(64), nullable=False, index=True)
    event_type = db.Column(db.String(64), nullable=False, index=True)
    payload = db.Column(db.JSON, nullable=True)
