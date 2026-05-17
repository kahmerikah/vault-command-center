from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class Notification(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "notifications"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    title = db.Column(db.String(140), nullable=False)
    body = db.Column(db.Text, nullable=False)
    channel = db.Column(db.String(32), default="in_app", nullable=False)
    status = db.Column(db.String(32), default="queued", nullable=False)
    is_read = db.Column(db.Boolean, default=False, nullable=False)
