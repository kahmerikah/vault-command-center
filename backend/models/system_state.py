from backend.extensions import db
from backend.models.base import TimestampMixin


class SystemState(db.Model, TimestampMixin):
    __tablename__ = "system_state"

    key = db.Column(db.String(128), primary_key=True)
    value = db.Column(db.JSON, nullable=True)