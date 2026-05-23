from backend.extensions import db, socketio
from backend.models import Notification
from backend.services.engine_service import EngineService
from backend.services.activity_service import ActivityService


class NotificationService:
    @staticmethod
    def create(user_id: str, title: str, body: str, channel: str = "in_app"):
        note = Notification(user_id=user_id, title=title, body=body, channel=channel)
        db.session.add(note)
        db.session.commit()
        socketio.emit("notification:new", {"user_id": user_id, "title": title, "body": body})
        EngineService.publish_event(
            "notification.created",
            {"user_id": user_id, "title": title, "body": body, "channel": channel, "notification_id": note.id},
            actor_id=user_id,
            source_module="notifications",
        )
        ActivityService.log(
            message=f"Notification created: {title}",
            actor_id=user_id,
            meta={"notification_id": note.id, "channel": channel},
        )
        return note
