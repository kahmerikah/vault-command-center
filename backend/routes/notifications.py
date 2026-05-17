from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.models import Notification
from backend.services.notification_service import NotificationService
from backend.utils.responses import success_response

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.get("")
@jwt_required()
def list_notifications():
    user_id = get_jwt_identity()
    notes = Notification.query.filter_by(user_id=user_id).order_by(Notification.created_at.desc()).all()
    return success_response(
        {
            "items": [
                {
                    "id": n.id,
                    "title": n.title,
                    "body": n.body,
                    "channel": n.channel,
                    "is_read": n.is_read,
                    "created_at": n.created_at.isoformat(),
                }
                for n in notes
            ]
        }
    )


@notifications_bp.post("")
@jwt_required()
def create_notification():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    note = NotificationService.create(
        user_id=user_id,
        title=data.get("title", "Vault Notification"),
        body=data.get("body", ""),
        channel=data.get("channel", "in_app"),
    )
    return success_response({"id": note.id}, 201)
