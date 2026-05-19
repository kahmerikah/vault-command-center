from decimal import Decimal
from backend.extensions import db
from backend.models.base import IdMixin, TimestampMixin


class FinancialAccount(db.Model, IdMixin, TimestampMixin):
    """Plaid-linked or manually added financial account."""
    __tablename__ = "financial_accounts"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    # Plaid fields
    plaid_item_id = db.Column(db.String(128), nullable=True)
    plaid_account_id = db.Column(db.String(128), nullable=True, unique=True)
    plaid_access_token_enc = db.Column(db.Text, nullable=True)  # encrypted at rest
    # Account metadata
    institution_name = db.Column(db.String(128), nullable=True)
    account_name = db.Column(db.String(128), nullable=False)
    account_type = db.Column(db.String(32), nullable=False)  # checking/savings/investment/credit
    account_subtype = db.Column(db.String(64), nullable=True)
    mask = db.Column(db.String(8), nullable=True)
    currency = db.Column(db.String(8), default="USD", nullable=False)
    # Live balances (refreshed via Plaid)
    balance_available = db.Column(db.Numeric(15, 2), nullable=True)
    balance_current = db.Column(db.Numeric(15, 2), nullable=True)
    balance_limit = db.Column(db.Numeric(15, 2), nullable=True)
    # Routing role
    routing_tag = db.Column(db.String(64), nullable=True)  # bills/investments/emergency/etc.
    is_active = db.Column(db.Boolean, default=True, nullable=False)


class PlaidTransaction(db.Model, IdMixin, TimestampMixin):
    """Normalized Plaid transaction record."""
    __tablename__ = "plaid_transactions"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    account_id = db.Column(db.String(36), db.ForeignKey("financial_accounts.id"), nullable=True)
    plaid_transaction_id = db.Column(db.String(128), nullable=False, unique=True)
    amount = db.Column(db.Numeric(15, 2), nullable=False)  # negative = debit
    currency = db.Column(db.String(8), default="USD", nullable=False)
    name = db.Column(db.String(255), nullable=False)
    merchant_name = db.Column(db.String(128), nullable=True)
    category = db.Column(db.String(128), nullable=True)
    category_detail = db.Column(db.String(128), nullable=True)
    transaction_date = db.Column(db.Date, nullable=False)
    pending = db.Column(db.Boolean, default=False, nullable=False)
    is_recurring = db.Column(db.Boolean, default=False, nullable=False)


class AllocationRule(db.Model, IdMixin, TimestampMixin):
    """Configurable money routing rule: percentage of income to a destination account."""
    __tablename__ = "allocation_rules"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    name = db.Column(db.String(128), nullable=False)
    description = db.Column(db.Text, nullable=True)
    # Destination
    destination_tag = db.Column(db.String(64), nullable=False)   # maps to FinancialAccount.routing_tag
    destination_account_id = db.Column(db.String(36), db.ForeignKey("financial_accounts.id"), nullable=True)
    # Rule logic
    allocation_pct = db.Column(db.Numeric(5, 2), nullable=False)  # 0.00–100.00
    min_balance_threshold = db.Column(db.Numeric(15, 2), nullable=True)  # skip if source below this
    max_transfer_amount = db.Column(db.Numeric(15, 2), nullable=True)    # cap per trigger
    # Trigger
    trigger = db.Column(db.String(32), default="income_received", nullable=False)
    priority = db.Column(db.Integer, default=50, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)


class RoutingEvent(db.Model, IdMixin, TimestampMixin):
    """Audit record of an automated routing decision."""
    __tablename__ = "routing_events"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    trigger = db.Column(db.String(64), nullable=False)
    source_account_id = db.Column(db.String(36), db.ForeignKey("financial_accounts.id"), nullable=True)
    rule_id = db.Column(db.String(36), db.ForeignKey("allocation_rules.id"), nullable=True)
    amount_routed = db.Column(db.Numeric(15, 2), nullable=False)
    destination_tag = db.Column(db.String(64), nullable=True)
    status = db.Column(db.String(32), default="simulated", nullable=False)  # simulated/queued/executed/failed
    dwolla_transfer_id = db.Column(db.String(128), nullable=True)
    notes = db.Column(db.Text, nullable=True)
