from flask import Blueprint, current_app, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.middleware.auth import require_roles
from backend.services.payments_service import PaymentsService
from backend.utils.responses import error_response, success_response

payments_bp = Blueprint("payments", __name__)


@payments_bp.post("/checkout/session")
@jwt_required()
@require_roles("super_admin", "admin", "seller", "member")
def create_checkout_session():
    data = request.get_json(silent=True) or {}
    amount_cents = int(data.get("amount_cents", 0))
    currency = data.get("currency", "usd")
    if amount_cents <= 0:
        return error_response("amount_cents must be positive", 400)

    frontend = current_app.config.get("FRONTEND_ORIGIN")
    session = PaymentsService.create_checkout_session(
        amount_cents=amount_cents,
        currency=currency,
        success_url=f"{frontend}/payments/success",
        cancel_url=f"{frontend}/payments/cancel",
        user_id=get_jwt_identity(),
    )
    return success_response({"checkout_url": session.url})


@payments_bp.post("/logs")
@jwt_required()
def create_payment_log():
    data = request.get_json(silent=True) or {}
    payment = PaymentsService.log_payment(
        user_id=get_jwt_identity(),
        provider_payment_id=data.get("provider_payment_id", "manual"),
        status=data.get("status", "pending"),
        amount=float(data.get("amount", 0)),
        currency=data.get("currency", "usd"),
    )
    return success_response({"id": payment.id}, 201)
