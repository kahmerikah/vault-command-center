from datetime import datetime
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.services.booking_service import BookingService
from backend.utils.responses import error_response, success_response

bookings_bp = Blueprint("bookings", __name__)


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
    return success_response({"id": booking.id, "status": booking.status}, 201)
