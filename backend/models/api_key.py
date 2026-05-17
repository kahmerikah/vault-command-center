from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class ApiKey(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "api_keys"

    label = db.Column(db.String(120), nullable=False)
    key_hash = db.Column(db.String(255), nullable=False, unique=True)
    role = db.Column(db.String(32), default="service", nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
