"""Financial OS routes: Plaid linking, accounts, transactions, allocation rules, money routing."""
from decimal import Decimal
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.extensions import db
from backend.middleware.auth import require_roles
from backend.models.financial import AllocationRule, FinancialAccount, PlaidTransaction, RoutingEvent
from backend.services.money_router import MoneyRouter
from backend.services.plaid_service import PlaidService
from backend.utils.pagination import paginate
from backend.utils.responses import error_response, success_response

financial_bp = Blueprint("financial", __name__)


# ── Plaid ──────────────────────────────────────────────────────────────────


@financial_bp.get("/plaid/link-token")
@jwt_required()
def plaid_link_token():
    user_id = get_jwt_identity()
    return success_response(PlaidService.create_link_token(user_id))


@financial_bp.post("/plaid/exchange")
@jwt_required()
def plaid_exchange():
    user_id = get_jwt_identity()
    data = request.json or {}
    public_token = data.get("public_token")
    if not public_token:
        return error_response("public_token required", 400)
    return success_response(PlaidService.exchange_public_token(user_id, public_token))


@financial_bp.post("/plaid/sync")
@jwt_required()
def plaid_sync():
    user_id = get_jwt_identity()
    days = int((request.json or {}).get("days", 30))
    result = PlaidService.sync_transactions(user_id, days=days)
    return success_response(result)


@financial_bp.post("/plaid/refresh-balances")
@jwt_required()
def plaid_refresh_balances():
    user_id = get_jwt_identity()
    return success_response({"results": PlaidService.refresh_balances(user_id)})


# ── Accounts ───────────────────────────────────────────────────────────────


@financial_bp.get("/accounts")
@jwt_required()
def list_accounts():
    user_id = get_jwt_identity()
    accounts = FinancialAccount.query.filter_by(user_id=user_id, is_active=True).all()
    return success_response({
        "items": [_serialize_account(a) for a in accounts],
        "total": len(accounts),
    })


@financial_bp.post("/accounts")
@jwt_required()
def create_account():
    user_id = get_jwt_identity()
    data = request.json or {}
    if not data.get("account_name") or not data.get("account_type"):
        return error_response("account_name and account_type required", 400)
    account = FinancialAccount(
        user_id=user_id,
        account_name=data["account_name"],
        account_type=data["account_type"],
        account_subtype=data.get("account_subtype"),
        institution_name=data.get("institution_name"),
        currency=data.get("currency", "USD"),
        routing_tag=data.get("routing_tag"),
        balance_current=data.get("balance_current"),
        balance_available=data.get("balance_available"),
    )
    db.session.add(account)
    db.session.commit()
    return success_response(_serialize_account(account), 201)


@financial_bp.patch("/accounts/<account_id>")
@jwt_required()
def update_account(account_id):
    user_id = get_jwt_identity()
    account = FinancialAccount.query.filter_by(id=account_id, user_id=user_id).first_or_404()
    data = request.json or {}
    for field in ("account_name", "routing_tag", "is_active", "balance_current", "balance_available"):
        if field in data:
            setattr(account, field, data[field])
    db.session.commit()
    return success_response(_serialize_account(account))


# ── Transactions ───────────────────────────────────────────────────────────


@financial_bp.get("/transactions")
@jwt_required()
def list_transactions():
    user_id = get_jwt_identity()
    q = PlaidTransaction.query.filter_by(user_id=user_id).order_by(
        PlaidTransaction.transaction_date.desc(), PlaidTransaction.created_at.desc()
    )
    result = paginate(q, page=int(request.args.get("page", 1)), limit=int(request.args.get("limit", 50)))
    result["items"] = [_serialize_tx(t) for t in result["items"]]
    return success_response(result)


# ── Allocation Rules ───────────────────────────────────────────────────────


@financial_bp.get("/allocation-rules")
@jwt_required()
def list_allocation_rules():
    user_id = get_jwt_identity()
    rules = AllocationRule.query.filter_by(user_id=user_id).order_by(AllocationRule.priority).all()
    return success_response({"items": [_serialize_rule(r) for r in rules], "total": len(rules)})


@financial_bp.post("/allocation-rules")
@jwt_required()
def create_allocation_rule():
    user_id = get_jwt_identity()
    data = request.json or {}
    required = ("name", "destination_tag", "allocation_pct")
    for field in required:
        if not data.get(field):
            return error_response(f"{field} required", 400)
    pct = Decimal(str(data["allocation_pct"]))
    if not (Decimal("0") < pct <= Decimal("100")):
        return error_response("allocation_pct must be between 0 and 100", 400)
    rule = AllocationRule(
        user_id=user_id,
        name=data["name"],
        description=data.get("description"),
        destination_tag=data["destination_tag"],
        destination_account_id=data.get("destination_account_id"),
        allocation_pct=pct,
        min_balance_threshold=data.get("min_balance_threshold"),
        max_transfer_amount=data.get("max_transfer_amount"),
        trigger=data.get("trigger", "income_received"),
        priority=int(data.get("priority", 50)),
    )
    db.session.add(rule)
    db.session.commit()
    return success_response(_serialize_rule(rule), 201)


@financial_bp.patch("/allocation-rules/<rule_id>")
@jwt_required()
def update_allocation_rule(rule_id):
    user_id = get_jwt_identity()
    rule = AllocationRule.query.filter_by(id=rule_id, user_id=user_id).first_or_404()
    data = request.json or {}
    for field in ("name", "description", "allocation_pct", "destination_tag", "priority", "is_active", "trigger"):
        if field in data:
            setattr(rule, field, data[field])
    db.session.commit()
    return success_response(_serialize_rule(rule))


@financial_bp.delete("/allocation-rules/<rule_id>")
@jwt_required()
def delete_allocation_rule(rule_id):
    user_id = get_jwt_identity()
    rule = AllocationRule.query.filter_by(id=rule_id, user_id=user_id).first_or_404()
    db.session.delete(rule)
    db.session.commit()
    return success_response({"deleted": True})


# ── Money Router ───────────────────────────────────────────────────────────


@financial_bp.post("/route")
@jwt_required()
def run_routing():
    user_id = get_jwt_identity()
    data = request.json or {}
    router = MoneyRouter(user_id=user_id)
    events = router.run(
        trigger=data.get("trigger", "income_received"),
        income_amount=Decimal(str(data["income_amount"])) if data.get("income_amount") else None,
        source_account_id=data.get("source_account_id"),
        execute=bool(data.get("execute", False)),
    )
    return success_response({"routing_events": events, "count": len(events)})


@financial_bp.get("/routing-history")
@jwt_required()
def routing_history():
    user_id = get_jwt_identity()
    q = RoutingEvent.query.filter_by(user_id=user_id).order_by(RoutingEvent.created_at.desc())
    result = paginate(q, page=int(request.args.get("page", 1)), limit=int(request.args.get("limit", 20)))
    result["items"] = [_serialize_routing_event(e) for e in result["items"]]
    return success_response(result)


# ── Serializers ────────────────────────────────────────────────────────────


def _serialize_account(a: FinancialAccount) -> dict:
    return {
        "id": a.id,
        "account_name": a.account_name,
        "account_type": a.account_type,
        "account_subtype": a.account_subtype,
        "institution_name": a.institution_name,
        "mask": a.mask,
        "routing_tag": a.routing_tag,
        "currency": a.currency,
        "balance_available": str(a.balance_available) if a.balance_available is not None else None,
        "balance_current": str(a.balance_current) if a.balance_current is not None else None,
        "is_plaid_linked": bool(a.plaid_account_id),
        "is_active": a.is_active,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _serialize_tx(t: PlaidTransaction) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "merchant_name": t.merchant_name,
        "amount": str(t.amount),
        "currency": t.currency,
        "category": t.category,
        "category_detail": t.category_detail,
        "transaction_date": t.transaction_date.isoformat() if t.transaction_date else None,
        "pending": t.pending,
        "is_recurring": t.is_recurring,
    }


def _serialize_rule(r: AllocationRule) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "description": r.description,
        "destination_tag": r.destination_tag,
        "destination_account_id": r.destination_account_id,
        "allocation_pct": str(r.allocation_pct),
        "trigger": r.trigger,
        "priority": r.priority,
        "is_active": r.is_active,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _serialize_routing_event(e: RoutingEvent) -> dict:
    return {
        "id": e.id,
        "trigger": e.trigger,
        "destination_tag": e.destination_tag,
        "amount_routed": str(e.amount_routed),
        "status": e.status,
        "dwolla_transfer_id": e.dwolla_transfer_id,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }
