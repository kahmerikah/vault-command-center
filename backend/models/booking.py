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

    # Rich event schema (additive — safe for existing rows)
    title = db.Column(db.String(255), nullable=True)
    event_type = db.Column(db.String(64), nullable=True, index=True)  # meeting|task|reminder|deal_review|property_tour|payment|other
    location = db.Column(db.String(512), nullable=True)
    description = db.Column(db.Text, nullable=True)
    attendees = db.Column(db.JSON, nullable=True)       # [{"name": ..., "email": ...}]
    tags = db.Column(db.JSON, nullable=True)             # ["deal", "property", "treasury"]
    priority = db.Column(db.String(16), nullable=True, default="medium")  # low|medium|high|critical
    color = db.Column(db.String(16), nullable=True)      # hex or named color token
    is_public = db.Column(db.Boolean, default=False, nullable=False)
    is_all_day = db.Column(db.Boolean, default=False, nullable=False)
    recurrence_rule = db.Column(db.String(256), nullable=True)
    linked_module = db.Column(db.String(64), nullable=True)  # property|financial|knowledge|contact
    linked_entity_id = db.Column(db.String(36), nullable=True)  # FK to linked entity
