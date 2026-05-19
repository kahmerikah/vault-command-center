from decimal import Decimal
from datetime import datetime

from flask import Blueprint, current_app, request
import stripe
from backend.extensions import db
from backend.models import Payment, User, WebhookEvent
from backend.services.activity_service import ActivityService
from backend.utils.responses import error_response, success_response

webhook_bp = Blueprint("stripe_webhook", __name__)


def _money_from_minor_units(value):
    return (Decimal(str(value or 0)) / Decimal("100")).quantize(Decimal("0.01"))


def _system_user_id():
    username = current_app.config.get("SYSTEM_USERNAME", "system")
    email = current_app.config.get("SYSTEM_EMAIL", "system@localhost")
    user = User.query.filter((User.username == username) | (User.email == email)).first()
    return user.id if user else None


def _resolve_user_id(source):
    metadata = source.get("metadata") or {}
    user_id = metadata.get("user_id") or source.get("client_reference_id")
    if user_id:
        user = User.query.filter_by(id=user_id).first()
        if user:
            return user.id
    return _system_user_id()


def _upsert_payment(provider_payment_id, user_id, status, amount, currency):
    payment = Payment.query.filter_by(provider="stripe", provider_payment_id=provider_payment_id).first()
    if not payment:
        if not user_id:
            raise ValueError("user mapping unavailable")
        payment = Payment(
            user_id=user_id,
            provider="stripe",
            provider_payment_id=provider_payment_id,
            status=status,
            amount=amount,
            currency=currency,
        )
        db.session.add(payment)
        return payment

    if user_id:
        payment.user_id = user_id
    payment.status = status
    payment.amount = amount
    payment.currency = currency or payment.currency
    return payment


def _upsert_refund(provider_payment_id, user_id, refund_amount, currency, dispute_status=None):
    payment = Payment.query.filter_by(provider="stripe", provider_payment_id=provider_payment_id).first()
    if not payment:
        if not user_id:
            raise ValueError("user mapping unavailable")
        payment = Payment(
            user_id=user_id,
            provider="stripe",
            provider_payment_id=provider_payment_id,
            status="refunded",
            amount=-refund_amount,
            currency=currency,
        )
        db.session.add(payment)
        return payment

    if user_id:
        payment.user_id = user_id
    current_amount = Decimal(payment.amount or 0)
    payment.amount = max(current_amount - refund_amount, Decimal("0.00"))
    payment.status = dispute_status or ("refunded" if payment.amount == 0 else "partially_refunded")
    payment.currency = currency or payment.currency
    return payment


def _handle_checkout_session_completed(event):
    session = event["data"]["object"]
    provider_payment_id = session.get("payment_intent") or session.get("id")
    if not provider_payment_id:
        raise ValueError("missing payment identifier")

    payment = _upsert_payment(
        provider_payment_id=provider_payment_id,
        user_id=_resolve_user_id(session),
        status="succeeded" if session.get("payment_status") == "paid" else session.get("payment_status") or "completed",
        amount=_money_from_minor_units(session.get("amount_total")),
        currency=(session.get("currency") or "usd").lower(),
    )
    db.session.flush()
    return payment


def _handle_payment_intent_succeeded(event):
    intent = event["data"]["object"]
    provider_payment_id = intent.get("id")
    if not provider_payment_id:
        raise ValueError("missing payment identifier")

    payment = _upsert_payment(
        provider_payment_id=provider_payment_id,
        user_id=_resolve_user_id(intent),
        status="succeeded",
        amount=_money_from_minor_units(intent.get("amount_received") or intent.get("amount")),
        currency=(intent.get("currency") or "usd").lower(),
    )
    db.session.flush()
    return payment


def _handle_refund_or_dispute(event_type, event):
    source = event["data"]["object"]
    provider_payment_id = source.get("payment_intent") or source.get("charge") or source.get("id")
    if not provider_payment_id:
        raise ValueError("missing payment identifier")

    currency = (source.get("currency") or "usd").lower()
    amount_minor = source.get("amount") or source.get("amount_refunded") or 0
    amount = _money_from_minor_units(amount_minor)
    user_id = _resolve_user_id(source)

    if event_type in {"charge.refunded", "refund.created", "refund.updated"}:
        payment = _upsert_refund(provider_payment_id, user_id, amount, currency)
    else:
        payment = Payment.query.filter_by(provider="stripe", provider_payment_id=provider_payment_id).first()
        if not payment:
            payment = _upsert_payment(
                provider_payment_id=provider_payment_id,
                user_id=user_id,
                status="disputed",
                amount=amount,
                currency=currency,
            )
        else:
            if user_id:
                payment.user_id = user_id
            payment.status = {
                "charge.dispute.created": "disputed",
                "charge.dispute.funds_withdrawn": "disputed_lost",
                "charge.dispute.funds_reinstated": "disputed_won",
                "charge.dispute.closed": f"disputed_{source.get('status', 'closed')}",
            }.get(event_type, "disputed")
            if source.get("status") == "lost":
                payment.amount = max(Decimal(payment.amount or 0) - amount, Decimal("0.00"))
            payment.currency = currency or payment.currency

    db.session.flush()
    return payment


@webhook_bp.post("/stripe")
def stripe_webhook():
    payload = request.data
    signature = request.headers.get("Stripe-Signature", "")
    secret = current_app.config.get("STRIPE_WEBHOOK_SECRET", "")

    try:
        event = stripe.Webhook.construct_event(payload=payload, sig_header=signature, secret=secret)
    except Exception:
        return error_response("invalid webhook", 400)

    event_id = event.get("id")
    event_type = event.get("type")

    existing = WebhookEvent.query.filter_by(provider="stripe", event_id=event_id).first()
    if existing and existing.status == "processed":
        return success_response({"received": True, "event_type": event_type, "already_processed": True})

    webhook_event = existing or WebhookEvent(
        provider="stripe",
        event_id=event_id,
        event_type=event_type or "unknown",
        livemode=bool(event.get("livemode", False)),
        status="received",
        payload=event,
    )
    webhook_event.event_type = event_type or webhook_event.event_type
    webhook_event.payload = event
    webhook_event.livemode = bool(event.get("livemode", webhook_event.livemode))
    webhook_event.error_message = None
    db.session.add(webhook_event)

    try:
        if event_type == "checkout.session.completed":
            _handle_checkout_session_completed(event)
        elif event_type == "payment_intent.succeeded":
            _handle_payment_intent_succeeded(event)
        elif event_type in {
            "charge.refunded",
            "refund.created",
            "refund.updated",
            "charge.dispute.created",
            "charge.dispute.funds_withdrawn",
            "charge.dispute.funds_reinstated",
            "charge.dispute.closed",
        }:
            _handle_refund_or_dispute(event_type, event)
    except ValueError as exc:
        webhook_event.status = "error"
        webhook_event.error_message = str(exc)
        db.session.rollback()
        db.session.add(webhook_event)
        db.session.commit()
        return error_response(str(exc), 400)

    webhook_event.status = "processed"
    webhook_event.processed_at = datetime.utcnow()
    db.session.commit()
    ActivityService.log(
        message=f"Stripe webhook processed: {event_type}",
        level="info",
        meta={"event_type": event_type, "event_id": event_id},
    )
    return success_response({"received": True, "event_type": event_type})
