from backend.extensions import db, socketio
from backend.models import Notification
from backend.services.activity_service import ActivityService


class NotificationService:
    @staticmethod
    def create(user_id: str, title: str, body: str, channel: str = "in_app", **kwargs):
        # Keep compatibility with older call sites that pass kind=... instead of channel=...
        channel = kwargs.get("kind") or channel
        note = Notification(user_id=user_id, title=title, body=body, channel=channel)
        db.session.add(note)
        db.session.commit()
        socketio.emit("notification:new", {"user_id": user_id, "title": title, "body": body}, to=f"user:{user_id}")
        socketio.emit(
            "engine:event",
            {
                "event_name": "notification.created",
                "module_key": kwargs.get("module_key"),
                "actor_id": user_id,
                "payload": {
                    "notification_id": note.id,
                    "user_id": user_id,
                    "title": title,
                    "channel": channel,
                },
                "created_at": note.created_at.isoformat(),
            },
            to="engine",
        )
        ActivityService.log(
            message=f"Notification created: {title}",
            actor_id=user_id,
            meta={"notification_id": note.id, "channel": channel},
        )
        return note
