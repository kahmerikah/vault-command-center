from decimal import Decimal
from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class Wallet(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "wallets"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    address = db.Column(db.String(128), unique=True, nullable=False)
    balance = db.Column(db.Numeric(30, 8), default=Decimal("0"), nullable=False)


class ChainTransaction(db.Model, IdMixin, TimestampMixin):
    __tablename__ = "chain_transactions"

    wallet_id = db.Column(db.String(36), db.ForeignKey("wallets.id"), nullable=False)
    tx_hash = db.Column(db.String(128), unique=True, nullable=False)
    tx_type = db.Column(db.String(64), nullable=False)
    amount = db.Column(db.Numeric(30, 8), default=Decimal("0"), nullable=False)
    status = db.Column(db.String(32), default="pending", nullable=False)
