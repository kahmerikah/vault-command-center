from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class RegisteredModule(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "registered_modules"

    key = db.Column(db.String(64), unique=True, nullable=False)
    name = db.Column(db.String(140), nullable=False)
    description = db.Column(db.String(255), nullable=True)
    is_enabled = db.Column(db.Boolean, default=True, nullable=False)
    route_prefix = db.Column(db.String(128), nullable=False)
