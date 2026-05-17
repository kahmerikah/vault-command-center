from datetime import datetime
import uuid
from backend.extensions import db


class TimestampMixin:
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class IdMixin:
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
