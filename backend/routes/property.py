"""Property Intelligence routes."""
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from backend.extensions import db
from backend.models.property import Property, PropertyComp
from backend.services.avm_calibration_service import AVMCalibrationService
from backend.services.property_service import PropertyService
from backend.services.property_scraper_service import PropertyScraperService
from backend.utils.pagination import paginate
from backend.utils.responses import error_response, success_response

property_bp = Blueprint("property", __name__)


@property_bp.get("")
@jwt_required()
def list_properties():
    user_id = get_jwt_identity()
    status_filter = request.args.get("status")
    try:
        q = Property.query.filter_by(user_id=user_id)
        if status_filter:
            q = q.filter_by(status=status_filter)
        q = q.order_by(Property.created_at.desc())
        result = paginate(q, page=int(request.args.get("page", 1)), limit=int(request.args.get("limit", 20)))
        result["items"] = [_serialize(p) for p in result["items"]]
        return success_response(result)
    except Exception as exc:
        return success_response(
            {
                "items": [],
                "total": 0,
                "page": 1,
                "limit": int(request.args.get("limit", 20)),
                "warning": f"Property data unavailable: {exc}",
            }
        )


@property_bp.post("")
@jwt_required()
def add_property():
    user_id = get_jwt_identity()
    data = request.json or {}
    if not data.get("address"):
        return error_response("address required", 400)
    try:
        prop = PropertyService.add_property(user_id=user_id, data=data)
    except ValueError as exc:
        return error_response(str(exc), 400)
    return success_response(_serialize(prop), 201)


@property_bp.post("/estimate")
@jwt_required()
def estimate_property():
    data = request.json or {}
    if not data.get("address"):
        return error_response("address required", 400)
    try:
        # Enrich with live Zillow data (Zestimate + property details) before running AVM.
        # Failure is non-fatal — AVM proceeds with whatever data is available.
        try:
            subject_details = PropertyScraperService.scrape_subject_property(address=data["address"])
            if subject_details:
                for field in ("sqft", "bedrooms", "bathrooms", "year_built", "latitude", "longitude"):
                    if not data.get(field) and subject_details.get(field) is not None:
                        data[field] = subject_details[field]
                if subject_details.get("zestimate"):
                    data["zestimate"] = subject_details["zestimate"]
        except Exception:
            pass

        estimate = PropertyService.estimate_value(data)
        return success_response(estimate)
    except ValueError as exc:
        return error_response(str(exc), 400)


@property_bp.post("/scrape-comps")
@jwt_required()
def scrape_property_comps():
    user_id = get_jwt_identity()
    data = request.json or {}
    address = str(data.get("address") or "").strip()
    zip_code = str(data.get("zip_code") or "").strip()
    if not address and not zip_code:
        return error_response("address or zip_code required", 400)

    property_id = data.get("property_id")
    tracked_property = None
    if property_id:
        tracked_property = Property.query.filter_by(id=property_id, user_id=user_id).first()
        if not tracked_property:
            return error_response("property not found", 404)

    property_type = data.get("property_type") or (tracked_property.property_type if tracked_property else "single_family")
    latitude = data.get("latitude") or (tracked_property.latitude if tracked_property else None)
    longitude = data.get("longitude") or (tracked_property.longitude if tracked_property else None)
    max_results = int(data.get("max_results") or 12)

    comps = PropertyScraperService.scrape_market_comps(
        address=address or (tracked_property.address if tracked_property else ""),
        zip_code=zip_code or (tracked_property.zip_code if tracked_property else None),
        property_type=property_type,
        subject_latitude=float(latitude) if latitude is not None else None,
        subject_longitude=float(longitude) if longitude is not None else None,
        max_results=max(1, min(max_results, 30)),
    )

    # Also enrich the subject property's own details from Zillow if an address is available.
    subject_address = address or (tracked_property.address if tracked_property else "")
    subject_details = None
    if subject_address:
        try:
            subject_details = PropertyScraperService.scrape_subject_property(address=subject_address)
        except Exception:
            subject_details = None

    # Merge scraped subject details into the estimate payload (only fill missing fields).
    sd = subject_details or {}
    inserted = 0
    if tracked_property and comps:
        inserted = PropertyScraperService.store_comps_for_property(property_id=tracked_property.id, comps=comps)

    estimate_payload = {
        "address": address or (tracked_property.address if tracked_property else ""),
        "zip_code": zip_code or (tracked_property.zip_code if tracked_property else ""),
        "city": data.get("city") or (tracked_property.city if tracked_property else None),
        "state": data.get("state") or (tracked_property.state if tracked_property else None),
        "property_type": property_type,
        "sqft": data.get("sqft") or (tracked_property.sqft if tracked_property else None) or sd.get("sqft"),
        "bedrooms": data.get("bedrooms") or (tracked_property.bedrooms if tracked_property else None) or sd.get("bedrooms"),
        "bathrooms": data.get("bathrooms") or (tracked_property.bathrooms if tracked_property else None) or sd.get("bathrooms"),
        "year_built": data.get("year_built") or (tracked_property.year_built if tracked_property else None) or sd.get("year_built"),
        "listing_price": data.get("listing_price") or (tracked_property.listing_price if tracked_property else None),
        "latitude": latitude or sd.get("latitude"),
        "longitude": longitude or sd.get("longitude"),
        "zestimate": sd.get("zestimate"),
        "scraped_comps": comps,
    }

    estimate = None
    try:
        estimate = PropertyService.estimate_value(estimate_payload)
    except ValueError:
        estimate = None

    return success_response(
        {
            "scraped_count": len(comps),
            "stored_count": inserted,
            "sources": sorted(list({c.get("source") for c in comps if c.get("source")})),
            "comps": comps[:10],
            "estimate": estimate,
            "subject_details": subject_details,
        }
    )


@property_bp.post("/<string:property_id>/scrape-async")
@jwt_required()
def scrape_property_async(property_id: str):
    """Enqueue a background scrape + re-analyze job and return the Celery task id."""
    user_id = get_jwt_identity()
    prop = Property.query.filter_by(id=property_id, user_id=user_id).first()
    if not prop:
        return error_response("property not found", 404)

    from backend.tasks.jobs import scrape_and_analyze_property_task
    task = scrape_and_analyze_property_task.delay(property_id=property_id)
    return success_response({"task_id": task.id, "property_id": property_id, "status": "queued"}, 202)


@property_bp.get("/avm-calibration")
@jwt_required()
def get_avm_calibration():
    property_type = request.args.get("property_type") or "single_family"
    calibration = AVMCalibrationService.get_for_market(
        zip_code=request.args.get("zip_code"),
        city=request.args.get("city"),
        state=request.args.get("state"),
        property_type=property_type,
    )
    market = {
        "zip_code": request.args.get("zip_code"),
        "city": request.args.get("city"),
        "state": request.args.get("state"),
        "property_type": property_type,
    }
    return success_response({"market": market, "calibration": calibration})


@property_bp.put("/avm-calibration")
@jwt_required()
def upsert_avm_calibration():
    payload = request.json or {}
    market = payload.get("market") or {}
    calibration = payload.get("calibration") or {}
    if not isinstance(market, dict) or not isinstance(calibration, dict):
        return error_response("market and calibration payloads are required", 400)

    market.setdefault("property_type", "single_family")
    updated = AVMCalibrationService.upsert_market(market=market, calibration=calibration)
    return success_response(updated)


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
    for field in ("status", "notes", "listing_price", "bedrooms", "bathrooms", "sqft", "latitude", "longitude"):
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
        "latitude": str(p.latitude) if p.latitude is not None else None,
        "longitude": str(p.longitude) if p.longitude is not None else None,
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
        "distance_miles": str(c.distance_miles) if c.distance_miles is not None else None,
        "latitude": str(c.latitude) if c.latitude is not None else None,
        "longitude": str(c.longitude) if c.longitude is not None else None,
        "source": c.source,
    }
