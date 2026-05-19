from sqlalchemy import func
from backend.models import (
    ActivityLog,
    AnalyticsEvent,
    Booking,
    ChainTransaction,
    Notification,
    Payment,
    RegisteredModule,
    Session,
    User,
)


def dashboard_metrics(user_id: str | None = None):
    unread_query = Notification.query
    if user_id:
        unread_query = unread_query.filter_by(user_id=user_id)

    return {
        "users_total": User.query.filter_by(is_active=True).count(),
        "sessions_total": Session.query.filter_by(is_revoked=False).count(),
        "payments_total": Payment.query.count(),
        "bookings_total": Booking.query.count(),
        "chain_tx_total": ChainTransaction.query.count(),
        "events_total": AnalyticsEvent.query.count(),
        "module_count": RegisteredModule.query.filter_by(is_enabled=True).count(),
        "notifications_unread": unread_query.filter_by(is_read=False).count(),
        "api_calls_total": ActivityLog.query.filter(ActivityLog.message.like("API call %")).count(),
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
