from flask import Blueprint, current_app, request
import stripe
from backend.utils.responses import error_response, success_response

webhook_bp = Blueprint("stripe_webhook", __name__)


@webhook_bp.post("/stripe")
def stripe_webhook():
    payload = request.data
    signature = request.headers.get("Stripe-Signature", "")
    secret = current_app.config.get("STRIPE_WEBHOOK_SECRET", "")

    try:
        event = stripe.Webhook.construct_event(payload=payload, sig_header=signature, secret=secret)
    except Exception:
        return error_response("invalid webhook", 400)

    # TODO: Route each Stripe event type to idempotent handlers and persist in Payment logs.
    return success_response({"received": True, "event_type": event.get("type")})
