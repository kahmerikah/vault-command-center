"""OS Layer routes — unified command search, continuity context, and operational intelligence."""
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from backend.models.financial import FinancialAccount, PlaidTransaction
from backend.models.knowledge import CalendarEvent, KnowledgeEntry
from backend.models.booking import Booking
from backend.models.contact import Contact
from backend.models.property import Property
from backend.models.notification import Notification
from backend.models.logs import ActivityLog
from backend.utils.responses import success_response

os_bp = Blueprint("os", __name__)

_LIMIT = 8


@os_bp.get("/search")
@jwt_required()
def command_search():
    """Universal cross-module search for command palette."""
    user_id = get_jwt_identity()
    q = (request.args.get("q") or "").strip().lower()

    if not q or len(q) < 2:
        return success_response({"results": [], "query": q})

    results = []

    # Properties
    try:
        props = (
            Property.query
            .filter(Property.user_id == user_id, Property.address.ilike(f"%{q}%"))
            .limit(_LIMIT).all()
        )
        for p in props:
            results.append({
                "kind": "property",
                "id": p.id,
                "title": p.address,
                "subtitle": f"{p.city or ''} · {p.deal_verdict or p.status or ''}",
                "url": "/property",
                "meta": {"deal_score": str(p.deal_score) if p.deal_score else None},
            })
    except Exception:
        pass

    # Knowledge entries
    try:
        notes = (
            KnowledgeEntry.query
            .filter(
                KnowledgeEntry.user_id == user_id,
                KnowledgeEntry.is_archived == False,
                (KnowledgeEntry.title.ilike(f"%{q}%") | KnowledgeEntry.body.ilike(f"%{q}%")),
            )
            .limit(_LIMIT).all()
        )
        for n in notes:
            results.append({
                "kind": "knowledge",
                "id": n.id,
                "title": n.title,
                "subtitle": f"{n.kind or 'note'} · {(n.category or '')}",
                "url": "/knowledge",
                "meta": {"tags": n.tags},
            })
    except Exception:
        pass

    # Contacts
    try:
        contacts = (
            Contact.query
            .filter(
                Contact.user_id == user_id,
                (Contact.display_name.ilike(f"%{q}%") | Contact.company.ilike(f"%{q}%")),
            )
            .limit(_LIMIT).all()
        )
        for c in contacts:
            results.append({
                "kind": "contact",
                "id": c.id,
                "title": c.display_name or c.company or "Contact",
                "subtitle": c.company or c.job_title or "",
                "url": "/pda",
                "meta": {},
            })
    except Exception:
        pass

    # Transactions
    try:
        txs = (
            PlaidTransaction.query
            .filter(
                PlaidTransaction.user_id == user_id,
                PlaidTransaction.name.ilike(f"%{q}%"),
            )
            .order_by(PlaidTransaction.transaction_date.desc())
            .limit(_LIMIT).all()
        )
        for t in txs:
            results.append({
                "kind": "transaction",
                "id": t.id,
                "title": t.name,
                "subtitle": f"{t.category or 'uncategorized'} · {str(t.transaction_date or '')}",
                "url": "/financial",
                "meta": {"amount": str(t.amount) if t.amount else None},
            })
    except Exception:
        pass

    # Bookings / events
    try:
        bookings = (
            Booking.query
            .filter(
                Booking.user_id == user_id,
                (Booking.title.ilike(f"%{q}%") | Booking.notes.ilike(f"%{q}%")),
            )
            .order_by(Booking.starts_at.asc())
            .limit(_LIMIT).all()
        )
        for b in bookings:
            results.append({
                "kind": "event",
                "id": b.id,
                "title": b.title or b.module_key or "Event",
                "subtitle": f"{b.event_type or 'booking'} · {str(b.starts_at)[:10] if b.starts_at else ''}",
                "url": "/pda",
                "meta": {},
            })
    except Exception:
        pass

    return success_response({"results": results[:24], "query": q})


@os_bp.get("/context")
@jwt_required()
def operational_context():
    """Returns the user's live operational context for the continuity bar."""
    user_id = get_jwt_identity()

    from datetime import datetime, timedelta
    now = datetime.utcnow()
    soon = now + timedelta(hours=48)

    # Upcoming bookings
    upcoming_events = []
    try:
        bookings = (
            Booking.query
            .filter(Booking.user_id == user_id, Booking.starts_at >= now, Booking.starts_at <= soon)
            .order_by(Booking.starts_at.asc())
            .limit(5).all()
        )
        upcoming_events = [
            {
                "id": b.id,
                "title": b.title or b.module_key or "Event",
                "starts_at": b.starts_at.isoformat(),
                "event_type": getattr(b, "event_type", "booking"),
            }
            for b in bookings
        ]
    except Exception:
        pass

    # Unread notifications
    unread_notifications = 0
    try:
        unread_notifications = Notification.query.filter_by(user_id=user_id, is_read=False).count()
    except Exception:
        pass

    # Open tasks (knowledge entries with category=todo, not archived)
    open_tasks = 0
    try:
        open_tasks = KnowledgeEntry.query.filter_by(
            user_id=user_id, category="todo", is_archived=False
        ).count()
    except Exception:
        pass

    # Active property pipeline
    active_properties = 0
    try:
        active_properties = Property.query.filter(
            Property.user_id == user_id,
            Property.status.in_(["watching", "active", "negotiating"]),
        ).count()
    except Exception:
        pass

    # Recent activity (last 3)
    recent_activity = []
    try:
        activity = (
            ActivityLog.query
            .filter_by(actor_id=user_id)
            .order_by(ActivityLog.created_at.desc())
            .limit(3).all()
        )
        recent_activity = [
            {"id": a.id, "message": a.message, "level": a.level, "created_at": a.created_at.isoformat()}
            for a in activity
        ]
    except Exception:
        pass

    return success_response({
        "upcoming_events": upcoming_events,
        "unread_notifications": unread_notifications,
        "open_tasks": open_tasks,
        "active_properties": active_properties,
        "recent_activity": recent_activity,
    })
