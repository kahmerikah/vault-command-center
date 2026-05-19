from flask import Blueprint, g, request
from flask_jwt_extended import get_jwt_identity, jwt_required, verify_jwt_in_request
from backend.extensions import db
from backend.models import ActivityLog
from backend.utils.responses import success_response

gateway_bp = Blueprint("gateway", __name__)


@gateway_bp.before_app_request
def log_request():
    if not request.path.startswith("/api/"):
        return

    actor_id = None
    try:
        verify_jwt_in_request(optional=True)
        actor_id = get_jwt_identity()
    except Exception:
        actor_id = None

    db.session.add(
        ActivityLog(
            actor_id=actor_id,
            level="info",
            message=f"API call {request.method} {request.path}",
            meta={
                "request_id": getattr(g, "request_id", "n/a"),
                "method": request.method,
                "path": request.path,
                "ip": request.remote_addr or "",
            },
        )
    )
    db.session.commit()


@gateway_bp.get("/status")
@jwt_required()
def gateway_status():
    return success_response({"gateway": "online", "version": "v1"})


@gateway_bp.get("/activity")
@jwt_required()
def activity_feed():
    level = (request.args.get("level") or "").strip().lower()
    page = max(int(request.args.get("page", 1)), 1)
    limit = min(max(int(request.args.get("limit", 20)), 1), 100)

    query = ActivityLog.query.order_by(ActivityLog.created_at.desc())
    if level:
        query = query.filter_by(level=level)

    paged = query.paginate(page=page, per_page=limit, error_out=False)
    return success_response(
        {
            "items": [
                {
                    "id": item.id,
                    "actor_id": item.actor_id,
                    "level": item.level,
                    "message": item.message,
                    "meta": item.meta or {},
                    "created_at": item.created_at.isoformat(),
                }
                for item in paged.items
            ],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": paged.total,
                "pages": paged.pages,
            },
        }
    )
