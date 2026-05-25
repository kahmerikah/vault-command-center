from datetime import datetime
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.engine.runtime import get_engine_runtime
from backend.extensions import db
from backend.models import Booking
from backend.services.booking_service import BookingService
from backend.services.activity_service import ActivityService
from backend.utils.responses import error_response, success_response

bookings_bp = Blueprint("bookings", __name__)


@bookings_bp.get("")
@jwt_required()
def list_bookings():
    user_id = get_jwt_identity()
    page = max(int(request.args.get("page", 1)), 1)
    limit = min(max(int(request.args.get("limit", 20)), 1), 100)
    status = (request.args.get("status") or "").strip().lower()

    query = Booking.query.filter_by(user_id=user_id)
    if status:
        query = query.filter_by(status=status)

    paged = query.order_by(Booking.starts_at.asc()).paginate(page=page, per_page=limit, error_out=False)
    return success_response(
        {
            "items": [_serialize(b) for b in paged.items],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": paged.total,
                "pages": paged.pages,
            },
        }
    )


@bookings_bp.post("")
@jwt_required()
def create_booking():
    payload = request.get_json(silent=True) or {}
    starts_at = payload.get("starts_at")
    ends_at = payload.get("ends_at")
    if not starts_at or not ends_at:
        return error_response("starts_at and ends_at are required", 400)

    booking = BookingService.create(
        user_id=get_jwt_identity(),
        module_key=payload.get("module_key", "booking"),
        starts_at=datetime.fromisoformat(starts_at),
        ends_at=datetime.fromisoformat(ends_at),
        notes=payload.get("notes", ""),
    )
    # Enrich with rich event fields if provided
    for field in ("title", "event_type", "location", "description", "attendees", "tags", "priority", "color", "is_public", "is_all_day", "recurrence_rule", "linked_module", "linked_entity_id"):
        if field in payload:
            setattr(booking, field, payload[field])
    from backend.extensions import db
    db.session.commit()

    ActivityService.log(
        message=f"Booking created: {booking.title or booking.module_key}",
        actor_id=get_jwt_identity(),
        meta={"booking_id": booking.id, "status": booking.status},
    )

    get_engine_runtime().events.emit(
        "booking.created",
        {
            "actor_id": get_jwt_identity(),
            "module_key": booking.module_key,
            "booking_id": booking.id,
            "status": booking.status,
            "starts_at": booking.starts_at.isoformat() if booking.starts_at else None,
            "ends_at": booking.ends_at.isoformat() if booking.ends_at else None,
        },
    )
    return success_response({"id": booking.id, "status": booking.status}, 201)


@bookings_bp.patch("/<booking_id>")
@jwt_required()
def update_booking(booking_id):
    user_id = get_jwt_identity()
    booking = Booking.query.filter_by(id=booking_id, user_id=user_id).first()
    if not booking:
        return error_response("booking not found", 404)

    payload = request.get_json(silent=True) or {}
    for field in ("title", "event_type", "location", "description", "notes", "attendees", "tags", "priority", "color", "is_public", "is_all_day", "recurrence_rule", "linked_module", "linked_entity_id", "status", "starts_at", "ends_at"):
        if field in payload:
            val = payload[field]
            if field in ("starts_at", "ends_at") and isinstance(val, str):
                val = datetime.fromisoformat(val)
            setattr(booking, field, val)
    from backend.extensions import db
    db.session.commit()
    return success_response(_serialize(booking))


@bookings_bp.patch("/<booking_id>/status")
@jwt_required()
def update_status(booking_id):
    user_id = get_jwt_identity()
    booking = Booking.query.filter_by(id=booking_id, user_id=user_id).first()
    if not booking:
        return error_response("booking not found", 404)

    payload = request.get_json(silent=True) or {}
    status = (payload.get("status") or "").strip().lower()
    if not status:
        return error_response("status is required", 400)

    booking.status = status
    db.session.commit()
    ActivityService.log(
        message=f"Booking status updated: {booking.id}",
        actor_id=user_id,
        meta={"booking_id": booking.id, "status": booking.status},
    )
    get_engine_runtime().events.emit(
        "booking.status_changed",
        {
            "actor_id": user_id,
            "module_key": booking.module_key,
            "booking_id": booking.id,
            "status": booking.status,
        },
    )
    return success_response({"id": booking.id, "status": booking.status})


def _serialize(b: Booking) -> dict:
    return {
        "id": b.id,
        "module_key": b.module_key,
        "title": b.title or b.module_key,
        "event_type": b.event_type or "booking",
        "location": b.location,
        "description": b.description,
        "notes": b.notes,
        "attendees": b.attendees or [],
        "tags": b.tags or [],
        "priority": b.priority or "medium",
        "color": b.color,
        "is_public": b.is_public,
        "is_all_day": b.is_all_day,
        "recurrence_rule": b.recurrence_rule,
        "linked_module": b.linked_module,
        "linked_entity_id": b.linked_entity_id,
        "starts_at": b.starts_at.isoformat() if b.starts_at else None,
        "ends_at": b.ends_at.isoformat() if b.ends_at else None,
        "status": b.status,
        "created_at": b.created_at.isoformat(),
        "updated_at": b.updated_at.isoformat(),
    }
