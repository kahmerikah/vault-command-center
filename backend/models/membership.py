"""Membership model — first-class platform tiers linked to blockchain wallets."""
from decimal import Decimal

from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class Membership(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "memberships"
    __table_args__ = (
        db.UniqueConstraint("user_id", name="uq_membership_user"),
    )

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    wallet_id = db.Column(db.String(36), db.ForeignKey("wallets.id"), nullable=True, index=True)

    # Tier: free | founder | operator | executive
    tier = db.Column(db.String(32), nullable=False, default="free", index=True)
    status = db.Column(db.String(32), nullable=False, default="active", index=True)

    # Token balance snapshot (synced from wallet; source of truth is wallet.balance)
    token_balance = db.Column(db.Numeric(30, 8), default=Decimal("0"), nullable=False)

    # Tier-specific unlocks and limits
    benefits = db.Column(db.JSON, nullable=True)       # {"modules": [...], "limits": {...}}
    tier_granted_at = db.Column(db.DateTime, nullable=True)
    tier_expires_at = db.Column(db.DateTime, nullable=True)

    # Social + display
    display_name = db.Column(db.String(128), nullable=True)
    avatar_url = db.Column(db.String(512), nullable=True)
    bio = db.Column(db.Text, nullable=True)
    public_profile = db.Column(db.Boolean, default=False, nullable=False)

    # Perks metadata
    event_quota_monthly = db.Column(db.Integer, default=10, nullable=False)
    booking_quota_monthly = db.Column(db.Integer, default=20, nullable=False)
    priority_support = db.Column(db.Boolean, default=False, nullable=False)
    early_access = db.Column(db.Boolean, default=False, nullable=False)

    user = db.relationship("User", backref=db.backref("membership", uselist=False))
    wallet = db.relationship("Wallet", backref=db.backref("membership", uselist=False))
