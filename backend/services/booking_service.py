from backend.extensions import db, socketio
from backend.models import Booking
from backend.services.activity_service import ActivityService


class BookingService:
    @staticmethod
    def create(user_id: str, module_key: str, starts_at, ends_at, notes: str = ""):
        booking = Booking(
            user_id=user_id,
            module_key=module_key,
            starts_at=starts_at,
            ends_at=ends_at,
            notes=notes,
            status="confirmed",
        )
        db.session.add(booking)
        db.session.commit()
        socketio.emit("booking:updated", {"booking_id": booking.id, "status": booking.status})
        ActivityService.log(
            message=f"Booking confirmed: {module_key}",
            actor_id=user_id,
            meta={"booking_id": booking.id, "status": booking.status},
        )
        return booking
