from flask import Blueprint, current_app, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func
from backend.middleware.auth import require_roles
from backend.models import Payment
from backend.services.activity_service import ActivityService
from backend.services.payments_service import PaymentsService
from backend.utils.responses import error_response, success_response

payments_bp = Blueprint("payments", __name__)


@payments_bp.get("")
@jwt_required()
def list_payments():
    page = max(int(request.args.get("page", 1)), 1)
    limit = min(max(int(request.args.get("limit", 20)), 1), 100)
    status = (request.args.get("status") or "").strip().lower()

    query = Payment.query.order_by(Payment.created_at.desc())
    if status:
        query = query.filter_by(status=status)

    paged = query.paginate(page=page, per_page=limit, error_out=False)
    return success_response(
        {
            "items": [
                {
                    "id": p.id,
                    "provider": p.provider,
                    "provider_payment_id": p.provider_payment_id,
                    "status": p.status,
                    "amount": float(p.amount or 0),
                    "currency": p.currency,
                    "created_at": p.created_at.isoformat(),
                }
                for p in paged.items
            ],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": paged.total,
                "pages": paged.pages,
            },
        }
    )


@payments_bp.get("/summary")
@jwt_required()
def summary():
    total_amount = Payment.query.with_entities(func.sum(Payment.amount)).scalar() or 0
    return success_response(
        {
            "payments_total": Payment.query.count(),
            "revenue_total": float(total_amount),
            "succeeded_total": Payment.query.filter_by(status="succeeded").count(),
            "refunded_total": Payment.query.filter(Payment.status.in_(["refunded", "partially_refunded"])).count(),
            "disputed_total": Payment.query.filter(Payment.status.like("disputed%")).count(),
        }
    )


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
    ActivityService.log(
        message="Stripe checkout session created",
        actor_id=get_jwt_identity(),
        meta={"checkout_url": session.url},
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
    ActivityService.log(
        message="Payment log created",
        actor_id=get_jwt_identity(),
        meta={"payment_id": payment.id, "status": payment.status, "amount": float(payment.amount)},
    )
    return success_response({"id": payment.id}, 201)
