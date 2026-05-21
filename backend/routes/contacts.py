from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.services.contact_service import ContactService
from backend.utils.responses import error_response, success_response

contacts_bp = Blueprint("contacts", __name__)


@contacts_bp.get("")
@jwt_required()
def list_contacts():
    user_id = get_jwt_identity()
    result = ContactService.list(
        user_id=user_id,
        query=request.args.get("q", ""),
        favorite=(request.args.get("favorite") or "").lower() == "true" if request.args.get("favorite") is not None else None,
        group=request.args.get("group", ""),
        limit=int(request.args.get("limit", 500)),
    )
    return success_response(result)


@contacts_bp.get("/<contact_id>")
@jwt_required()
def get_contact(contact_id):
    user_id = get_jwt_identity()
    return success_response(ContactService.get(contact_id=contact_id, user_id=user_id))


@contacts_bp.post("")
@jwt_required()
def create_contact():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    if not (data.get("first_name") or data.get("last_name") or data.get("company") or data.get("nickname")):
        return error_response("contact name or company is required", 400)
    return success_response(ContactService.create(user_id=user_id, data=data), 201)


@contacts_bp.patch("/<contact_id>")
@jwt_required()
def update_contact(contact_id):
    user_id = get_jwt_identity()
    return success_response(ContactService.update(contact_id=contact_id, user_id=user_id, data=request.get_json(silent=True) or {}))


@contacts_bp.delete("/<contact_id>")
@jwt_required()
def delete_contact(contact_id):
    user_id = get_jwt_identity()
    ContactService.delete(contact_id=contact_id, user_id=user_id)
    return success_response({"archived": True})


@contacts_bp.post("/<contact_id>/favorite")
@jwt_required()
def favorite_contact(contact_id):
    user_id = get_jwt_identity()
    payload = request.get_json(silent=True) or {}
    is_favorite = bool(payload.get("is_favorite", True))
    return success_response(ContactService.set_favorite(contact_id=contact_id, user_id=user_id, is_favorite=is_favorite))


@contacts_bp.post("/merge-duplicates")
@jwt_required()
def merge_duplicates():
    user_id = get_jwt_identity()
    return success_response(ContactService.merge_duplicates(user_id=user_id))


@contacts_bp.post("/<contact_id>/link")
@jwt_required()
def link_contact(contact_id):
    user_id = get_jwt_identity()
    payload = request.get_json(silent=True) or {}
    linked_contact_id = (payload.get("linked_contact_id") or "").strip()
    if not linked_contact_id:
        return error_response("linked_contact_id is required", 400)
    return success_response(ContactService.link_contacts(user_id=user_id, primary_contact_id=contact_id, linked_contact_id=linked_contact_id))


@contacts_bp.post("/<contact_id>/unlink")
@jwt_required()
def unlink_contact(contact_id):
    user_id = get_jwt_identity()
    payload = request.get_json(silent=True) or {}
    linked_contact_id = (payload.get("linked_contact_id") or "").strip()
    if not linked_contact_id:
        return error_response("linked_contact_id is required", 400)
    return success_response(ContactService.unlink_contact(user_id=user_id, primary_contact_id=contact_id, linked_contact_id=linked_contact_id))


@contacts_bp.get("/export/vcard")
@jwt_required()
def export_vcard():
    user_id = get_jwt_identity()
    contact_ids = request.args.get("ids", "")
    ids = [item for item in contact_ids.split(",") if item.strip()] if contact_ids else None
    return success_response(ContactService.export_vcard(user_id=user_id, contact_ids=ids))


@contacts_bp.post("/import/vcard")
@jwt_required()
def import_vcard():
    user_id = get_jwt_identity()
    payload = request.get_json(silent=True) or {}
    vcard_text = payload.get("vcard") or ""
    if not vcard_text.strip():
        return error_response("vcard is required", 400)
    return success_response(ContactService.import_vcard(user_id=user_id, vcard_text=vcard_text, merge=bool(payload.get("merge", True))))
