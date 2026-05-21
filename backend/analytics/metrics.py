from datetime import datetime

from sqlalchemy import func
from backend.extensions import db
from backend.models import (
    ActivityLog,
    AnalyticsEvent,
    Booking,
    ChainTransaction,
    Notification,
    Payment,
    RegisteredModule,
    Session,
    SystemState,
    User,
)


API_CALLS_BASELINE_KEY = "api_calls_external_baseline_at"


def _baseline_to_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _ensure_api_calls_baseline():
    state = SystemState.query.filter_by(key=API_CALLS_BASELINE_KEY).first()
    if state:
        baseline = _baseline_to_datetime((state.value or {}).get("timestamp"))
        if baseline:
            return baseline

    baseline = datetime.utcnow()
    payload = {"timestamp": baseline.isoformat(), "kind": "external_api_calls"}
    if state:
        state.value = payload
    else:
        db.session.add(SystemState(key=API_CALLS_BASELINE_KEY, value=payload))
    db.session.commit()
    return baseline


def reset_external_api_calls_baseline():
    baseline = datetime.utcnow()
    payload = {"timestamp": baseline.isoformat(), "kind": "external_api_calls"}

    state = SystemState.query.filter_by(key=API_CALLS_BASELINE_KEY).first()
    if state:
        state.value = payload
    else:
        db.session.add(SystemState(key=API_CALLS_BASELINE_KEY, value=payload))
    db.session.commit()
    return baseline


def external_api_calls_query():
    baseline = _ensure_api_calls_baseline()
    return ActivityLog.query.filter(ActivityLog.message.like("API call %")).filter(ActivityLog.created_at >= baseline)


def external_api_calls_total():
    return external_api_calls_query().count()


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
        "api_calls_total": external_api_calls_total(),
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
