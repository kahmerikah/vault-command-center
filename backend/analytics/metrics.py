from sqlalchemy import func
from backend.models import AnalyticsEvent, Booking, ChainTransaction, Payment, User


def dashboard_metrics():
    return {
        "users_total": User.query.filter_by(is_active=True).count(),
        "payments_total": Payment.query.count(),
        "bookings_total": Booking.query.count(),
        "chain_tx_total": ChainTransaction.query.count(),
        "events_total": AnalyticsEvent.query.count(),
    }


def revenue_by_day(limit=14):
    rows = (
        Payment.query.with_entities(func.date(Payment.created_at), func.sum(Payment.amount))
        .group_by(func.date(Payment.created_at))
        .order_by(func.date(Payment.created_at).desc())
        .limit(limit)
        .all()
    )
    return [{"date": str(day), "amount": float(amount or 0)} for day, amount in reversed(rows)]
