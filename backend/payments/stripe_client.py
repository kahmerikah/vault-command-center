import stripe
from flask import current_app


class StripeClient:
    def __init__(self):
        stripe.api_key = current_app.config.get("STRIPE_SECRET_KEY")

    def create_checkout_session(self, amount_cents: int, currency: str, success_url: str, cancel_url: str):
        return stripe.checkout.Session.create(
            mode="payment",
            line_items=[
                {
                    "price_data": {
                        "currency": currency,
                        "product_data": {"name": "SOMB Vault Purchase"},
                        "unit_amount": amount_cents,
                    },
                    "quantity": 1,
                }
            ],
            success_url=success_url,
            cancel_url=cancel_url,
        )
