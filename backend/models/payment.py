from decimal import Decimal
from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class Payment(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "payments"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    provider = db.Column(db.String(32), default="stripe", nullable=False)
    provider_payment_id = db.Column(db.String(128), nullable=False, unique=True)
    status = db.Column(db.String(32), nullable=False)
    amount = db.Column(db.Numeric(15, 2), nullable=False, default=Decimal("0.00"))
    currency = db.Column(db.String(8), default="usd", nullable=False)


class Subscription(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "subscriptions"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    stripe_customer_id = db.Column(db.String(128), nullable=False)
    stripe_subscription_id = db.Column(db.String(128), nullable=False, unique=True)
    status = db.Column(db.String(32), nullable=False)
    current_period_end = db.Column(db.DateTime, nullable=True)
