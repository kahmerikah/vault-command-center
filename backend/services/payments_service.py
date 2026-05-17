from backend.extensions import db
from backend.models import Payment
from backend.payments.stripe_client import StripeClient


class PaymentsService:
    @staticmethod
    def create_checkout_session(amount_cents: int, currency: str, success_url: str, cancel_url: str):
        return StripeClient().create_checkout_session(
            amount_cents=amount_cents,
            currency=currency,
            success_url=success_url,
            cancel_url=cancel_url,
        )

    @staticmethod
    def log_payment(user_id: str, provider_payment_id: str, status: str, amount: float, currency: str):
        payment = Payment(
            user_id=user_id,
            provider_payment_id=provider_payment_id,
            status=status,
            amount=amount,
            currency=currency,
        )
        db.session.add(payment)
        db.session.commit()
        return payment
