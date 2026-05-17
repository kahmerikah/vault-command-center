from backend.extensions import db, socketio
from backend.models import Notification


class NotificationService:
    @staticmethod
    def create(user_id: str, title: str, body: str, channel: str = "in_app"):
        note = Notification(user_id=user_id, title=title, body=body, channel=channel)
        db.session.add(note)
        db.session.commit()
        socketio.emit("notification:new", {"user_id": user_id, "title": title, "body": body})
        return note
