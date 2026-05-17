from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


role_permissions = db.Table(
    "role_permissions",
    db.Column("role_id", db.String(36), db.ForeignKey("roles.id"), primary_key=True),
    db.Column(
        "permission_id",
        db.String(36),
        db.ForeignKey("permissions.id"),
        primary_key=True,
    ),
)


class Role(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "roles"

    name = db.Column(db.String(64), unique=True, nullable=False)
    description = db.Column(db.String(255), nullable=True)
    permissions = db.relationship("Permission", secondary=role_permissions, backref="roles")


class Permission(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "permissions"

    code = db.Column(db.String(128), unique=True, nullable=False)
    description = db.Column(db.String(255), nullable=True)
