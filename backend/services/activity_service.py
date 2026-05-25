from backend.extensions import db, socketio
from backend.models import ActivityLog


class ActivityService:
    @staticmethod
    def log(message: str, level: str = "info", actor_id: str | None = None, meta: dict | None = None):
        entry = ActivityLog(actor_id=actor_id, level=level, message=message, meta=meta or {})
        db.session.add(entry)
        db.session.commit()

        socketio.emit(
            "activity:new",
            {
                "id": entry.id,
                "level": entry.level,
                "message": entry.message,
                "created_at": entry.created_at.isoformat(),
                "meta": entry.meta or {},
            },
        )

        socketio.emit(
            "engine:event",
            {
                "event_name": "activity.logged",
                "module_key": (meta or {}).get("module_key"),
                "actor_id": actor_id,
                "payload": {
                    "activity_id": entry.id,
                    "message": message,
                    "level": level,
                    "meta": meta or {},
                },
                "created_at": entry.created_at.isoformat(),
            },
            to="engine",
        )
        return entry
