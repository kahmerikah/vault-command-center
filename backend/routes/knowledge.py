"""Knowledge OS routes — searchable vault."""
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.services.knowledge_service import KnowledgeService
from backend.utils.responses import error_response, success_response

knowledge_bp = Blueprint("knowledge", __name__)


@knowledge_bp.get("")
@jwt_required()
def search_knowledge():
    user_id = get_jwt_identity()
    result = KnowledgeService.search(
        user_id=user_id,
        q=request.args.get("q", ""),
        kind=request.args.get("kind"),
        category=request.args.get("category"),
        page=int(request.args.get("page", 1)),
        limit=int(request.args.get("limit", 20)),
    )
    return success_response(result)


@knowledge_bp.post("")
@jwt_required()
def create_entry():
    user_id = get_jwt_identity()
    data = request.json or {}
    if not data.get("title") or not data.get("body"):
        return error_response("title and body required", 400)
    entry = KnowledgeService.create(user_id=user_id, data=data)
    return success_response(KnowledgeService._serialize(entry), 201)


@knowledge_bp.get("/<entry_id>")
@jwt_required()
def get_entry(entry_id):
    user_id = get_jwt_identity()
    from backend.models.knowledge import KnowledgeEntry
    entry = KnowledgeEntry.query.filter_by(id=entry_id, user_id=user_id, is_archived=False).first_or_404()
    return success_response(KnowledgeService._serialize(entry))


@knowledge_bp.patch("/<entry_id>")
@jwt_required()
def update_entry(entry_id):
    user_id = get_jwt_identity()
    entry = KnowledgeService.update(entry_id=entry_id, user_id=user_id, data=request.json or {})
    return success_response(KnowledgeService._serialize(entry))


@knowledge_bp.delete("/<entry_id>")
@jwt_required()
def delete_entry(entry_id):
    user_id = get_jwt_identity()
    KnowledgeService.delete(entry_id=entry_id, user_id=user_id)
    return success_response({"archived": True})


@knowledge_bp.get("/kinds")
@jwt_required()
def list_kinds():
    return success_response({
        "kinds": [
            "note", "prompt", "idea", "workflow", "architecture",
            "api_doc", "strategy", "recipe", "infrastructure", "automation",
        ]
    })


@knowledge_bp.post("/bootstrap-api-docs")
@jwt_required()
def bootstrap_api_docs():
    user_id = get_jwt_identity()
    result = KnowledgeService.bootstrap_api_docs(user_id=user_id)
    return success_response(result)
