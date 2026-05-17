from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class Session(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "sessions"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    refresh_token_jti = db.Column(db.String(128), nullable=False, unique=True)
    user_agent = db.Column(db.String(255), nullable=True)
    ip_address = db.Column(db.String(64), nullable=True)
    is_revoked = db.Column(db.Boolean, default=False, nullable=False)
