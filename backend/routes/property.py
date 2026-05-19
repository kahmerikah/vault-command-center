"""Property Intelligence routes."""
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.extensions import db
from backend.models.property import Property, PropertyComp
from backend.services.property_service import PropertyService
from backend.utils.pagination import paginate
from backend.utils.responses import error_response, success_response

property_bp = Blueprint("property", __name__)


@property_bp.get("")
@jwt_required()
def list_properties():
    user_id = get_jwt_identity()
    status_filter = request.args.get("status")
    q = Property.query.filter_by(user_id=user_id)
    if status_filter:
        q = q.filter_by(status=status_filter)
    q = q.order_by(Property.created_at.desc())
    result = paginate(q, page=int(request.args.get("page", 1)), limit=int(request.args.get("limit", 20)))
    result["items"] = [_serialize(p) for p in result["items"]]
    return success_response(result)


@property_bp.post("")
@jwt_required()
def add_property():
    user_id = get_jwt_identity()
    data = request.json or {}
    if not data.get("address") or not data.get("zip_code"):
        return error_response("address and zip_code required", 400)
    prop = PropertyService.add_property(user_id=user_id, data=data)
    return success_response(_serialize(prop), 201)


@property_bp.post("/estimate")
@jwt_required()
def estimate_property():
    data = request.json or {}
    if not data.get("address") or not data.get("zip_code"):
        return error_response("address and zip_code required", 400)
    try:
        estimate = PropertyService.estimate_value(data)
        return success_response(estimate)
    except ValueError as exc:
        return error_response(str(exc), 400)


@property_bp.get("/<property_id>")
@jwt_required()
def get_property(property_id):
    user_id = get_jwt_identity()
    prop = Property.query.filter_by(id=property_id, user_id=user_id).first_or_404()
    comps = PropertyComp.query.filter_by(property_id=property_id).order_by(PropertyComp.sale_date.desc()).all()
    data = _serialize(prop)
    data["comps"] = [_serialize_comp(c) for c in comps]
    return success_response(data)


@property_bp.post("/<property_id>/analyze")
@jwt_required()
def re_analyze(property_id):
    user_id = get_jwt_identity()
    prop = Property.query.filter_by(id=property_id, user_id=user_id).first_or_404()
    PropertyService.analyze(prop)
    db.session.commit()
    return success_response(_serialize(prop))


@property_bp.patch("/<property_id>")
@jwt_required()
def update_property(property_id):
    user_id = get_jwt_identity()
    prop = Property.query.filter_by(id=property_id, user_id=user_id).first_or_404()
    data = request.json or {}
    for field in ("status", "notes", "listing_price", "bedrooms", "bathrooms", "sqft"):
        if field in data:
            setattr(prop, field, data[field])
    db.session.commit()
    return success_response(_serialize(prop))


@property_bp.delete("/<property_id>")
@jwt_required()
def delete_property(property_id):
    user_id = get_jwt_identity()
    prop = Property.query.filter_by(id=property_id, user_id=user_id).first_or_404()
    db.session.delete(prop)
    db.session.commit()
    return success_response({"deleted": True})


# ── iPhone Shortcut-friendly quick-add (API key auth) ──────────────────────
@property_bp.post("/quick-add")
def quick_add_property():
    """Accepts requests from iPhone Shortcuts via X-Vault-API-Key header."""
    from backend.models.api_key import ApiKey
    from backend.models.user import User
    key_value = request.headers.get("X-Vault-API-Key") or (request.json or {}).get("api_key")
    if not key_value:
        return error_response("API key required", 401)
    api_key = ApiKey.query.filter_by(key=key_value, is_active=True).first()
    if not api_key:
        return error_response("Invalid API key", 401)
    data = request.json or {}
    if not data.get("address") or not data.get("zip_code"):
        return error_response("address and zip_code required", 400)
    data["source"] = "iphone_shortcut"
    prop = PropertyService.add_property(user_id=api_key.user_id, data=data)
    return success_response({
        "id": prop.id,
        "address": prop.address,
        "deal_verdict": prop.deal_verdict,
        "deal_score": str(prop.deal_score) if prop.deal_score else None,
        "price_deviation_pct": str(prop.price_deviation_pct) if prop.price_deviation_pct else None,
        "estimated_value": str(prop.estimated_value) if prop.estimated_value else None,
        "estimated_rent": str(prop.estimated_rent) if prop.estimated_rent else None,
        "monthly_mortgage_est": str(prop.monthly_mortgage_est) if prop.monthly_mortgage_est else None,
    }, 201)


def _serialize(p: Property) -> dict:
    return {
        "id": p.id,
        "address": p.address,
        "city": p.city,
        "state": p.state,
        "zip_code": p.zip_code,
        "property_type": p.property_type,
        "bedrooms": p.bedrooms,
        "bathrooms": str(p.bathrooms) if p.bathrooms else None,
        "sqft": p.sqft,
        "listing_price": str(p.listing_price) if p.listing_price else None,
        "estimated_value": str(p.estimated_value) if p.estimated_value else None,
        "estimated_rent": str(p.estimated_rent) if p.estimated_rent else None,
        "area_avg_price": str(p.area_avg_price) if p.area_avg_price else None,
        "deal_score": str(p.deal_score) if p.deal_score else None,
        "deal_verdict": p.deal_verdict,
        "price_deviation_pct": str(p.price_deviation_pct) if p.price_deviation_pct else None,
        "cap_rate_pct": str(p.cap_rate_pct) if p.cap_rate_pct else None,
        "roi_estimate_pct": str(p.roi_estimate_pct) if p.roi_estimate_pct else None,
        "monthly_mortgage_est": str(p.monthly_mortgage_est) if p.monthly_mortgage_est else None,
        "status": p.status,
        "notes": p.notes,
        "source": p.source,
        "last_analyzed_at": p.last_analyzed_at.isoformat() if p.last_analyzed_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _serialize_comp(c: PropertyComp) -> dict:
    return {
        "id": c.id,
        "address": c.address,
        "sale_price": str(c.sale_price),
        "sqft": c.sqft,
        "bedrooms": c.bedrooms,
        "bathrooms": str(c.bathrooms) if c.bathrooms else None,
        "price_per_sqft": str(c.price_per_sqft) if c.price_per_sqft else None,
        "sale_date": c.sale_date.isoformat() if c.sale_date else None,
        "source": c.source,
    }
