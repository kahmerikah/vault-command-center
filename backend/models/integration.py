from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class IntegrationAccount(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "integration_accounts"
    __table_args__ = (
        db.UniqueConstraint("user_id", "provider", name="uq_integration_user_provider"),
    )

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    provider = db.Column(db.String(32), nullable=False, index=True)
    provider_account_id = db.Column(db.String(255), nullable=True)

    access_token_enc = db.Column(db.Text, nullable=True)
    refresh_token_enc = db.Column(db.Text, nullable=True)
    token_expires_at = db.Column(db.DateTime, nullable=True)

    scopes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(32), nullable=False, default="connected")
    settings = db.Column(db.JSON, nullable=True)
    last_synced_at = db.Column(db.DateTime, nullable=True)
