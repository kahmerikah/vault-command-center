from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class Booking(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "bookings"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    module_key = db.Column(db.String(64), nullable=False, index=True)
    starts_at = db.Column(db.DateTime, nullable=False)
    ends_at = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.String(32), default="pending", nullable=False)
    notes = db.Column(db.Text, nullable=True)
