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
    page = max(int(request.args.get("page", 1)), 1)
    limit = min(max(int(request.args.get("limit", 20)), 1), 100)
    include_archived = (request.args.get("include_archived", "false").lower() == "true")

    query = Notification.query.filter_by(user_id=user_id)
    if not include_archived:
        query = query.filter(Notification.status != "archived")

    paged = query.order_by(Notification.created_at.desc()).paginate(page=page, per_page=limit, error_out=False)
    return success_response(
        {
            "items": [
                {
                    "id": n.id,
                    "title": n.title,
                    "body": n.body,
                    "channel": n.channel,
                    "is_read": n.is_read,
                    "status": n.status,
                    "created_at": n.created_at.isoformat(),
                }
                for n in paged.items
            ],
            "unread_count": Notification.query.filter_by(user_id=user_id, is_read=False).count(),
            "pagination": {
                "page": page,
                "limit": limit,
                "total": paged.total,
                "pages": paged.pages,
            },
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


@notifications_bp.post("/<notification_id>/read")
@jwt_required()
def mark_read(notification_id):
    user_id = get_jwt_identity()
    note = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
    if not note:
        return success_response({"updated": False}, 404)

    note.is_read = True
    if note.status == "queued":
        note.status = "read"
    from backend.extensions import db

    db.session.commit()
    return success_response({"updated": True})


@notifications_bp.post("/<notification_id>/archive")
@jwt_required()
def archive(notification_id):
    user_id = get_jwt_identity()
    note = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
    if not note:
        return success_response({"updated": False}, 404)

    note.status = "archived"
    from backend.extensions import db

    db.session.commit()
    return success_response({"updated": True})
