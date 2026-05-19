from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class KnowledgeEntry(db.Model, IdMixin, TimestampMixin):
    """A searchable knowledge vault entry."""
    __tablename__ = "knowledge_entries"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    title = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(64), nullable=True, index=True)
    # e.g. prompt/idea/workflow/api_doc/architecture/strategy/recipe/infrastructure
    kind = db.Column(db.String(32), default="note", nullable=False, index=True)
    tags = db.Column(db.Text, nullable=True)   # comma-separated
    is_pinned = db.Column(db.Boolean, default=False, nullable=False)
    is_archived = db.Column(db.Boolean, default=False, nullable=False)
    version = db.Column(db.Integer, default=1, nullable=False)
    source = db.Column(db.String(64), nullable=True)   # manual/api/iphone/import


class BriefingLog(db.Model, IdMixin, TimestampMixin):
    """Generated morning or night briefing."""
    __tablename__ = "briefing_logs"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    kind = db.Column(db.String(16), nullable=False)  # morning / night
    payload = db.Column(db.JSON, nullable=False)
    delivered_at = db.Column(db.DateTime, nullable=True)
    delivery_channel = db.Column(db.String(32), nullable=True)  # dashboard/email/webhook


class CalendarEvent(db.Model, IdMixin, TimestampMixin):
    """Unified calendar event synced across providers."""
    __tablename__ = "calendar_events"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    booking_id = db.Column(db.String(36), db.ForeignKey("bookings.id"), nullable=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    starts_at = db.Column(db.DateTime, nullable=False)
    ends_at = db.Column(db.DateTime, nullable=False)
    location = db.Column(db.String(255), nullable=True)
    provider = db.Column(db.String(32), nullable=False)  # google/apple/outlook/internal
    provider_event_id = db.Column(db.String(255), nullable=True)
    is_all_day = db.Column(db.Boolean, default=False, nullable=False)
    status = db.Column(db.String(32), default="confirmed", nullable=False)
    recurring_rule = db.Column(db.String(255), nullable=True)  # RRULE string
