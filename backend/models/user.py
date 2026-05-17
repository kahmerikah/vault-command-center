from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class User(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "users"

    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_verified = db.Column(db.Boolean, default=False, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    role_id = db.Column(db.String(36), db.ForeignKey("roles.id"), nullable=False)

    role = db.relationship("Role", backref="users")
