"""Property Intelligence Engine.

Evaluates real estate properties with an internal AVM that weights nearby
comparables by property type, size, beds/baths, age, and location.
"""
import re
import math
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, date
from typing import Optional
from backend.extensions import db
from backend.models.property import Property, PropertyComp
from backend.services.activity_service import ActivityService
from backend.services.avm_calibration_service import AVMCalibrationService


# ── Market baseline data (2024-2025 median price/sqft, NAR / Zillow sourced) ──
# Used as a fallback when no DB comps exist for a zip code.
_STATE_MEDIAN_PPSF: dict = {
    "AL": 115, "AK": 175, "AZ": 205, "AR": 108, "CA": 365,
    "CO": 285, "CT": 220, "DE": 205, "FL": 235, "GA": 162,
    "HI": 495, "ID": 218, "IL": 162, "IN": 132, "IA": 122,
    "KS": 132, "KY": 132, "LA": 142, "ME": 198, "MD": 232,
    "MA": 315, "MI": 158, "MN": 182, "MS": 102, "MO": 148,
    "MT": 255, "NE": 158, "NV": 225, "NH": 245, "NJ": 275,
    "NM": 162, "NY": 280, "NC": 188, "ND": 148, "OH": 148,
    "OK": 122, "OR": 288, "PA": 178, "RI": 268, "SC": 178,
    "SD": 158, "TN": 188, "TX": 172, "UT": 258, "VT": 225,
    "VA": 238, "WA": 328, "WV": 102, "WI": 172, "WY": 202,
    "DC": 458,
}

_CITY_MEDIAN_PPSF: dict = {
    "san francisco": 880, "new york": 720, "manhattan": 1250,
    "los angeles": 565, "seattle": 458, "boston": 528,
    "miami": 425, "chicago": 235, "austin": 295, "denver": 325,
    "portland": 325, "san diego": 590, "sacramento": 320,
    "rancho cordova": 278, "elk grove": 295, "roseville": 310,
    "phoenix": 215, "las vegas": 225, "atlanta": 222,
    "dallas": 215, "houston": 158, "nashville": 295,
    "charlotte": 228, "orlando": 218, "tampa": 245,
    "raleigh": 235, "minneapolis": 198, "richmond": 222,
    "jacksonville": 192, "baltimore": 205, "louisville": 148,
    "memphis": 118, "indianapolis": 148, "columbus": 168,
    "cincinnati": 158, "cleveland": 128, "pittsburgh": 145,
    "detroit": 118, "milwaukee": 148, "kansas city": 158,
    "st. louis": 148, "salt lake city": 278, "albuquerque": 168,
    "tucson": 188, "el paso": 138, "fresno": 225,
    "long beach": 555, "virginia beach": 212, "colorado springs": 242,
    "fort worth": 198, "san antonio": 168,
}

_STATE_NAME_TO_ABBREV: dict = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
    "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
    "new mexico": "NM", "new york": "NY", "north carolina": "NC",
    "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR",
    "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
    "district of columbia": "DC",
}

_NATIONAL_MEDIAN_PPSF = 185  # fallback when state is also unknown


def _market_baseline_ppsf(city: Optional[str], state: Optional[str]) -> int:
    """Return best-available median $/sqft for a city or state."""
    city_key = (city or "").strip().lower()
    if city_key in _CITY_MEDIAN_PPSF:
        return _CITY_MEDIAN_PPSF[city_key]
    state_key = (state or "").strip()
    abbrev = _STATE_NAME_TO_ABBREV.get(state_key.lower()) or (state_key.upper() if len(state_key) == 2 else None)
    if abbrev and abbrev in _STATE_MEDIAN_PPSF:
        return _STATE_MEDIAN_PPSF[abbrev]
    return _NATIONAL_MEDIAN_PPSF


class PropertyService:
    DEAL_THRESHOLD_PCT = Decimal("5.0")   # within 5% of area avg = good deal

    @staticmethod
    def estimate_value(data: dict) -> dict:
        """Estimate value/deal metrics from subject property features and nearby comps."""
        normalized = PropertyService._normalize_property_inputs(data)
        result = PropertyService._run_internal_avm(
            {
                "address": normalized["address"],
                "zip_code": normalized["zip_code"],
                "city": normalized.get("city"),
                "state": normalized.get("state"),
                "property_type": normalized.get("property_type", "single_family"),
                "bedrooms": normalized.get("bedrooms"),
                "bathrooms": normalized.get("bathrooms"),
                "lot_size_sqft": normalized.get("lot_size_sqft"),
                "latitude": normalized.get("latitude"),
                "longitude": normalized.get("longitude"),
                "year_built": normalized.get("year_built"),
                "listing_price": normalized.get("listing_price"),
                "sqft": normalized.get("sqft"),
                "zestimate": _to_decimal(data.get("zestimate")),
                "target_roi_pct": _to_decimal(data.get("target_roi_pct")),
                "rehab_estimate": _to_decimal(data.get("rehab_estimate")),
                "down_payment_pct": _to_decimal(data.get("down_payment_pct")) or Decimal("20"),
                "interest_rate_pct": _to_decimal(data.get("interest_rate_pct")) or Decimal("7"),
                "loan_years": _to_int(data.get("loan_years")) or 30,
                "expense_ratio_pct": _to_decimal(data.get("expense_ratio_pct")) or Decimal("35"),
            },
            extra_comps=data.get("scraped_comps") or [],
        )
        result["source"] = normalized.get("source", "manual")
        result["status"] = normalized.get("status", "watching")
        result["notes"] = normalized.get("notes")
        return result

    @staticmethod
    def add_property(user_id: str, data: dict) -> Property:
        normalized = PropertyService._normalize_property_inputs(data)
        prop = Property(
            user_id=user_id,
            address=normalized["address"],
            city=normalized.get("city"),
            state=normalized.get("state"),
            zip_code=normalized["zip_code"],
            property_type=normalized.get("property_type", "single_family"),
            bedrooms=normalized.get("bedrooms"),
            bathrooms=normalized.get("bathrooms"),
            sqft=normalized.get("sqft"),
            lot_size_sqft=normalized.get("lot_size_sqft"),
            latitude=normalized.get("latitude"),
            longitude=normalized.get("longitude"),
            year_built=normalized.get("year_built"),
            listing_price=normalized.get("listing_price"),
            notes=normalized.get("notes"),
            source=normalized.get("source", "manual"),
            status=normalized.get("status", "watching"),
        )
        db.session.add(prop)
        db.session.flush()
        PropertyService.analyze(prop)
        db.session.commit()
        ActivityService.log(
            actor_id=user_id,
            message=f"Property added: {prop.address} ({prop.zip_code})",
            level="info",
        )
        return prop

    @staticmethod
    def analyze(prop: Property) -> Property:
        """Run the internal AVM and persist valuation fields."""
        subject_details = {}
        try:
            from backend.services.property_scraper_service import PropertyScraperService

            # Keep persisted valuations aligned with live estimate flow by enriching
            # from Zillow subject details (including zestimate) when available.
            subject_details = PropertyScraperService.scrape_subject_property(address=prop.address) or {}
        except Exception:
            subject_details = {}

        result = PropertyService._run_internal_avm(
            {
                "address": prop.address,
                "zip_code": prop.zip_code,
                "city": prop.city,
                "state": prop.state,
                "property_type": prop.property_type,
                "bedrooms": prop.bedrooms or subject_details.get("bedrooms"),
                "bathrooms": prop.bathrooms or subject_details.get("bathrooms"),
                "lot_size_sqft": prop.lot_size_sqft,
                "latitude": prop.latitude or subject_details.get("latitude"),
                "longitude": prop.longitude or subject_details.get("longitude"),
                "year_built": prop.year_built or subject_details.get("year_built"),
                "listing_price": prop.listing_price,
                "sqft": prop.sqft or subject_details.get("sqft"),
                "zestimate": subject_details.get("zestimate"),
            },
            property_id=prop.id,
        )

        prop.area_avg_price = _to_decimal(result.get("area_avg_price"))
        prop.area_avg_price_sqft = _to_decimal(result.get("area_avg_price_sqft"))
        prop.estimated_value = _to_decimal(result.get("estimated_value"))
        prop.estimated_rent = _to_decimal(result.get("estimated_rent"))
        prop.monthly_mortgage_est = _to_decimal(result.get("monthly_mortgage_est"))
        prop.price_deviation_pct = _to_decimal(result.get("price_deviation_pct"))
        prop.deal_verdict = result.get("deal_verdict")
        prop.deal_score = _to_decimal(result.get("deal_score"))
        prop.cap_rate_pct = _to_decimal(result.get("cap_rate_pct"))
        prop.roi_estimate_pct = _to_decimal(result.get("roi_estimate_pct"))
        prop.last_analyzed_at = datetime.utcnow()
        return prop

    @staticmethod
    def _run_internal_avm(subject: dict, property_id: Optional[str] = None, extra_comps: Optional[list] = None) -> dict:
        zip_code = str(subject.get("zip_code") or "").strip()
        if not zip_code:
            raise ValueError("zip_code required")

        property_type = subject.get("property_type") or "single_family"
        listing_price = _to_decimal(subject.get("listing_price"))
        sqft = _to_int(subject.get("sqft"))
        bedrooms = _to_int(subject.get("bedrooms"))
        bathrooms = _to_decimal(subject.get("bathrooms"))
        latitude = _to_decimal(subject.get("latitude"))
        longitude = _to_decimal(subject.get("longitude"))
        year_built = _to_int(subject.get("year_built"))

        down_payment_pct = _to_decimal(subject.get("down_payment_pct")) or Decimal("20")
        interest_rate_pct = _to_decimal(subject.get("interest_rate_pct")) or Decimal("7")
        loan_years = _to_int(subject.get("loan_years")) or 30
        expense_ratio_pct = _to_decimal(subject.get("expense_ratio_pct")) or Decimal("35")

        calibration = AVMCalibrationService.get_for_market(
            zip_code=zip_code,
            city=subject.get("city"),
            state=subject.get("state"),
            property_type=property_type,
        )

        comps = PropertyService._fetch_market_snapshot(
            zip_code=zip_code,
            property_type=property_type,
            property_id=property_id,
        )
        comps.extend(PropertyService._normalize_comp_inputs(extra_comps or [], property_type=property_type))

        # ── Market baseline fallback ─────────────────────────────────────────
        # When no real comps exist, synthesise one virtual comp from national /
        # state / city median price-per-sqft so the AVM still returns a
        # meaningful (rough) estimate instead of all-zeros.
        using_market_baseline = False
        if not comps:
            ppsf = _market_baseline_ppsf(subject.get("city"), subject.get("state"))
            sqft_est = sqft or 1600
            baseline_price = Decimal(str(ppsf * sqft_est))
            comps.append({
                "address": f"Market Baseline ({subject.get('city') or subject.get('state') or 'US avg'})",
                "sale_price": baseline_price,
                "price_per_sqft": Decimal(str(ppsf)),
                "sqft": sqft_est,
                "bedrooms": bedrooms or 3,
                "bathrooms": bathrooms or Decimal("2"),
                "year_built": year_built,
                "distance_miles": None,
                "latitude": None,
                "longitude": None,
                "property_type": property_type,
                "source": "market_baseline",
            })
            using_market_baseline = True

        for comp in comps:
            if comp.get("distance_miles") is None:
                comp_lat = _to_decimal(comp.get("latitude"))
                comp_lng = _to_decimal(comp.get("longitude"))
                dist = PropertyService._distance_miles(
                    subject_lat=latitude,
                    subject_lng=longitude,
                    comp_lat=comp_lat,
                    comp_lng=comp_lng,
                )
                if dist is not None:
                    comp["distance_miles"] = dist

        weighted = PropertyService._weighted_comp_estimate(
            subject={
                "property_type": property_type,
                "sqft": sqft,
                "bedrooms": bedrooms,
                "bathrooms": bathrooms,
                "year_built": year_built,
                "latitude": latitude,
                "longitude": longitude,
            },
            comps=comps,
            calibration=calibration,
        )

        area_avg, area_avg_sqft = PropertyService._compute_area_avg_from_dicts(comps)
        estimated_value = weighted.get("estimated_value")
        if estimated_value is None and sqft and area_avg_sqft:
            estimated_value = (Decimal(str(sqft)) * area_avg_sqft).quantize(Decimal("0.01"))
        if estimated_value is None:
            estimated_value = area_avg or listing_price

        # If a Zillow Zestimate is available, use it as the authoritative estimated_value.
        # The internal AVM still runs for deal scoring, benchmarking, and comp analysis,
        # but the displayed value anchors to Zillow's machine-learned estimate.
        zestimate_val = _to_decimal(subject.get("zestimate"))
        if zestimate_val and zestimate_val > 0:
            estimated_value = zestimate_val
        estimated_value_source = "zillow_zestimate" if (zestimate_val and zestimate_val > 0) else "internal_avm"

        rent_yield = weighted.get("rent_yield") or PropertyService._rent_yield_for_type(property_type)
        estimated_rent = None
        if estimated_value:
            estimated_rent = (estimated_value * rent_yield).quantize(Decimal("0.01"))

        purchase_price = listing_price or estimated_value
        monthly_mortgage_est = PropertyService._estimate_mortgage(
            purchase_price,
            down_payment_pct=down_payment_pct,
            annual_rate_pct=interest_rate_pct,
            years=loan_years,
        )
        monthly_tax_est = PropertyService._estimate_property_tax(purchase_price)

        monthly_expense_est = None
        monthly_cash_flow_est = None
        if estimated_rent:
            monthly_expense_est = (estimated_rent * (expense_ratio_pct / Decimal("100"))).quantize(Decimal("0.01"))
            monthly_cash_flow_est = (
                estimated_rent - monthly_expense_est - (monthly_mortgage_est or Decimal("0")) - (monthly_tax_est or Decimal("0"))
            ).quantize(Decimal("0.01"))

        price_deviation_pct = None
        deal_verdict = "unknown"
        deal_score = None
        benchmark = weighted.get("weighted_avg_price") or area_avg
        if listing_price and benchmark and benchmark > 0:
            deviation = ((listing_price - benchmark) / benchmark * 100).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            price_deviation_pct = deviation
            if deviation <= PropertyService.DEAL_THRESHOLD_PCT:
                deal_verdict = "good_deal"
            elif deviation <= Decimal("15"):
                deal_verdict = "fair"
            else:
                deal_verdict = "overpriced"
            raw_score = max(Decimal("0"), Decimal("100") - (deviation + PropertyService.DEAL_THRESHOLD_PCT) * 2)
            comp_boost = min(Decimal(str(len(comps))), Decimal("10"))
            deal_score = min(raw_score + comp_boost, Decimal("100")).quantize(Decimal("0.01"))

        cap_rate_pct = None
        roi_estimate_pct = None
        if purchase_price and estimated_rent:
            annual_rent = estimated_rent * 12
            expenses_est = annual_rent * (expense_ratio_pct / Decimal("100"))
            noi = annual_rent - expenses_est
            if purchase_price > 0:
                cap_rate_pct = (noi / purchase_price * 100).quantize(Decimal("0.0001"))
                annual_net = noi - (monthly_mortgage_est or 0) * 12
                roi_estimate_pct = (annual_net / purchase_price * 100).quantize(Decimal("0.0001"))

        confidence_score = PropertyService._confidence_score(
            comps_count=len(comps),
            has_sqft=bool(sqft),
            has_listing=bool(listing_price),
            has_city_state=bool(subject.get("city") and subject.get("state")),
        )
        confidence_score = max(1, min(99, confidence_score + int(weighted.get("confidence_boost", 0))))
        if using_market_baseline:
            confidence_score = min(confidence_score, 22)
        confidence_label = PropertyService._confidence_label(confidence_score)

        neighborhood_trend = PropertyService._neighborhood_trend(price_deviation_pct, comps_count=len(comps))
        if using_market_baseline:
            neighborhood_trend = "stable"  # no real sales data; default neutral
        appreciation_trend = PropertyService._appreciation_trend(area_avg_sqft)
        risk_level = PropertyService._risk_level(confidence_score, price_deviation_pct)

        opportunity_classification = "monitor"
        if deal_verdict == "good_deal" and monthly_cash_flow_est and monthly_cash_flow_est > 0:
            opportunity_classification = "acquisition_candidate"
        elif deal_verdict == "overpriced":
            opportunity_classification = "avoid"

        return {
            "address": subject.get("address"),
            "zip_code": zip_code,
            "city": subject.get("city"),
            "state": subject.get("state"),
            "latitude": str(latitude) if latitude is not None else None,
            "longitude": str(longitude) if longitude is not None else None,
            "property_type": property_type,
            "bedrooms": bedrooms,
            "bathrooms": str(bathrooms) if bathrooms is not None else None,
            "lot_size_sqft": subject.get("lot_size_sqft"),
            "year_built": year_built,
            "listing_price": str(listing_price) if listing_price is not None else None,
            "sqft": sqft,
            "area_avg_price": str(area_avg) if area_avg is not None else None,
            "area_avg_price_sqft": str(area_avg_sqft) if area_avg_sqft is not None else None,
            "estimated_value": str(estimated_value) if estimated_value is not None else None,
            "estimated_value_source": estimated_value_source,
            "estimated_rent": str(estimated_rent) if estimated_rent is not None else None,
            "monthly_mortgage_est": str(monthly_mortgage_est) if monthly_mortgage_est is not None else None,
            "monthly_tax_est": str(monthly_tax_est) if monthly_tax_est is not None else None,
            "monthly_expense_est": str(monthly_expense_est) if monthly_expense_est is not None else None,
            "monthly_cash_flow_est": str(monthly_cash_flow_est) if monthly_cash_flow_est is not None else None,
            "price_deviation_pct": str(price_deviation_pct) if price_deviation_pct is not None else None,
            "deal_verdict": deal_verdict,
            "deal_score": str(deal_score) if deal_score is not None else None,
            "cap_rate_pct": str(cap_rate_pct) if cap_rate_pct is not None else None,
            "roi_estimate_pct": str(roi_estimate_pct) if roi_estimate_pct is not None else None,
            "confidence_score": confidence_score,
            "confidence": confidence_label,
            "neighborhood_trend": neighborhood_trend,
            "appreciation_trend": appreciation_trend,
            "risk_level": risk_level,
            "opportunity_classification": opportunity_classification,
            "target_roi_pct": str(subject.get("target_roi_pct")) if subject.get("target_roi_pct") is not None else None,
            "rehab_estimate": str(subject.get("rehab_estimate")) if subject.get("rehab_estimate") is not None else None,
            "zestimate": str(zestimate_val) if zestimate_val else None,
            "comps_used": len(comps),
            "comps": comps[:8],
            "data_source": "market_baseline" if using_market_baseline else "db_comps",
            "avm_details": {
                "weighted_avg_price": str(weighted.get("weighted_avg_price")) if weighted.get("weighted_avg_price") is not None else None,
                "weighted_avg_ppsf": str(weighted.get("weighted_avg_ppsf")) if weighted.get("weighted_avg_ppsf") is not None else None,
                "rent_yield_used": str(rent_yield),
                "similarity_average": weighted.get("similarity_average"),
                "market_calibration": calibration,
                "feature_adjustments": weighted.get("feature_adjustments") or {},
                "top_comps": weighted.get("top_comps") or [],
            },
        }

    @staticmethod
    def _weighted_comp_estimate(subject: dict, comps: list[dict], calibration: Optional[dict] = None) -> dict:
        weighted_price = Decimal("0")
        weighted_ppsf = Decimal("0")
        weighted_rent_yield = Decimal("0")
        weight_sum = Decimal("0")
        sim_sum = Decimal("0")
        sim_count = 0
        feature_totals = {
            "type": Decimal("0"),
            "size": Decimal("0"),
            "beds": Decimal("0"),
            "baths": Decimal("0"),
            "year": Decimal("0"),
            "geo": Decimal("0"),
        }
        ranked_comps = []

        for comp in comps:
            comp_price = _to_decimal(comp.get("sale_price"))
            if comp_price is None or comp_price <= 0:
                continue

            similarity, components = PropertyService._comp_similarity(subject, comp, calibration=calibration)
            if similarity <= 0:
                continue

            comp_ppsf = _to_decimal(comp.get("price_per_sqft"))

            weight = Decimal(str(similarity))
            weighted_price += comp_price * weight
            weight_sum += weight
            sim_sum += Decimal(str(similarity))
            sim_count += 1

            for key in feature_totals:
                feature_totals[key] += Decimal(str(components.get(key, 0.0)))

            ranked_comps.append(
                {
                    "address": comp.get("address"),
                    "sale_price": str(comp_price),
                    "sqft": comp.get("sqft"),
                    "bedrooms": comp.get("bedrooms"),
                    "bathrooms": str(comp.get("bathrooms")) if comp.get("bathrooms") is not None else None,
                    "price_per_sqft": str(comp_ppsf) if comp_ppsf is not None else None,
                    "distance_miles": str(comp.get("distance_miles")) if comp.get("distance_miles") is not None else None,
                    "source": comp.get("source"),
                    "similarity": round(float(similarity), 4),
                    "feature_adjustments": components,
                }
            )

            if comp_ppsf is not None and comp_ppsf > 0:
                weighted_ppsf += comp_ppsf * weight

            comp_type = comp.get("property_type") or subject.get("property_type")
            weighted_rent_yield += PropertyService._rent_yield_for_type(comp_type) * weight

        if weight_sum <= 0:
            return {
                "estimated_value": None,
                "weighted_avg_price": None,
                "weighted_avg_ppsf": None,
                "rent_yield": None,
                "similarity_average": None,
                "confidence_boost": 0,
                "feature_adjustments": {},
                "top_comps": [],
            }

        weighted_avg_price = (weighted_price / weight_sum).quantize(Decimal("0.01"))
        weighted_avg_ppsf = (weighted_ppsf / weight_sum).quantize(Decimal("0.01")) if weighted_ppsf > 0 else None
        estimated_value = weighted_avg_price

        subject_sqft = _to_int(subject.get("sqft"))
        if subject_sqft and weighted_avg_ppsf:
            estimated_value = (Decimal(str(subject_sqft)) * weighted_avg_ppsf).quantize(Decimal("0.01"))

        avg_similarity = float((sim_sum / Decimal(str(sim_count))).quantize(Decimal("0.0001"))) if sim_count else None
        rent_yield = (weighted_rent_yield / weight_sum).quantize(Decimal("0.0001")) if weighted_rent_yield > 0 else None
        confidence_boost = min(10, int((avg_similarity or 0) * 12)) if avg_similarity is not None else 0
        feature_adjustments = {}
        if sim_count:
            feature_adjustments = {
                key: float((total / Decimal(str(sim_count))).quantize(Decimal("0.0001")))
                for key, total in feature_totals.items()
            }

        ranked_comps.sort(key=lambda c: c.get("similarity", 0), reverse=True)

        return {
            "estimated_value": estimated_value,
            "weighted_avg_price": weighted_avg_price,
            "weighted_avg_ppsf": weighted_avg_ppsf,
            "rent_yield": rent_yield,
            "similarity_average": avg_similarity,
            "confidence_boost": confidence_boost,
            "feature_adjustments": feature_adjustments,
            "top_comps": ranked_comps[:5],
        }

    @staticmethod
    def _comp_similarity(subject: dict, comp: dict, calibration: Optional[dict] = None) -> tuple[float, dict]:
        calibration = calibration or AVMCalibrationService.get_default()
        weights = calibration.get("weights") or {}
        bounds = calibration.get("bounds") or {}

        similarity = 1.0
        components = {
            "type": 0.0,
            "size": 0.0,
            "beds": 0.0,
            "baths": 0.0,
            "year": 0.0,
            "geo": 0.0,
        }

        subject_type = (subject.get("property_type") or "").strip().lower()
        comp_type = (comp.get("property_type") or subject_type).strip().lower()
        if subject_type and comp_type:
            if subject_type == comp_type:
                delta = float(weights.get("type_match_bonus", 0.35))
                similarity += delta
                components["type"] += delta
            elif {subject_type, comp_type} <= {"single_family", "multi_family"}:
                delta = float(weights.get("type_related_bonus", 0.15))
                similarity += delta
                components["type"] += delta
            else:
                delta = float(weights.get("type_mismatch_penalty", 0.20))
                similarity -= delta
                components["type"] -= delta

        subject_sqft = _to_int(subject.get("sqft"))
        comp_sqft = _to_int(comp.get("sqft"))
        if subject_sqft and comp_sqft and comp_sqft > 0:
            diff_pct = abs(subject_sqft - comp_sqft) / max(subject_sqft, 1)
            size_floor = float(bounds.get("sqft_floor", 0.55))
            size_weight = float(weights.get("sqft_weight", 0.70))
            factor = max(size_floor, 1 - diff_pct * size_weight)
            similarity *= factor
            components["size"] = factor - 1

        subject_beds = _to_int(subject.get("bedrooms"))
        comp_beds = _to_int(comp.get("bedrooms"))
        if subject_beds is not None and comp_beds is not None:
            bed_diff = abs(subject_beds - comp_beds)
            bed_floor = float(bounds.get("bed_floor", 0.70))
            bed_weight = float(weights.get("bed_weight", 0.08))
            factor = max(bed_floor, 1 - bed_diff * bed_weight)
            similarity *= factor
            components["beds"] = factor - 1

        subject_baths = _to_decimal(subject.get("bathrooms"))
        comp_baths = _to_decimal(comp.get("bathrooms"))
        if subject_baths is not None and comp_baths is not None:
            bath_diff = abs(float(subject_baths - comp_baths))
            bath_floor = float(bounds.get("bath_floor", 0.75))
            bath_weight = float(weights.get("bath_weight", 0.06))
            factor = max(bath_floor, 1 - bath_diff * bath_weight)
            similarity *= factor
            components["baths"] = factor - 1

        subject_year = _to_int(subject.get("year_built"))
        comp_year = _to_int(comp.get("year_built"))
        if subject_year and comp_year:
            year_diff = abs(subject_year - comp_year)
            year_floor = float(bounds.get("year_floor", 0.75))
            year_weight = float(weights.get("year_weight", 1 / 240))
            factor = max(year_floor, 1 - min(year_diff, 80) * year_weight)
            similarity *= factor
            components["year"] = factor - 1

        distance = _to_decimal(comp.get("distance_miles"))
        if distance is None:
            distance = PropertyService._distance_miles(
                subject_lat=_to_decimal(subject.get("latitude")),
                subject_lng=_to_decimal(subject.get("longitude")),
                comp_lat=_to_decimal(comp.get("latitude")),
                comp_lng=_to_decimal(comp.get("longitude")),
            )
        if distance is not None:
            d = float(distance)
            if d <= 0.25:
                delta = float(weights.get("distance_close_bonus_025", 0.25))
                similarity += delta
                components["geo"] += delta
            elif d <= 0.5:
                delta = float(weights.get("distance_close_bonus_05", 0.15))
                similarity += delta
                components["geo"] += delta
            elif d <= 1.0:
                delta = float(weights.get("distance_close_bonus_1", 0.05))
                similarity += delta
                components["geo"] += delta
            elif d >= 3:
                delta = float(weights.get("distance_far_penalty_3", 0.20))
                similarity -= delta
                components["geo"] -= delta

            geo_decay = float(weights.get("distance_penalty_per_mile", 0.07))
            distance_factor = max(0.60, 1 - d * geo_decay)
            similarity *= distance_factor
            components["geo"] += distance_factor - 1

        similarity_min = float(bounds.get("similarity_min", 0.05))
        similarity_max = float(bounds.get("similarity_max", 2.5))
        return max(similarity_min, min(similarity, similarity_max)), components

    @staticmethod
    def _rent_yield_for_type(property_type: Optional[str]) -> Decimal:
        mapping = {
            "single_family": Decimal("0.0068"),
            "condo": Decimal("0.0062"),
            "multi_family": Decimal("0.0078"),
            "land": Decimal("0.0000"),
            "commercial": Decimal("0.0085"),
        }
        return mapping.get((property_type or "single_family").strip().lower(), Decimal("0.0068"))

    @staticmethod
    def _fetch_comps(prop: Property) -> list:
        """Try RapidAPI Zillow; fall back to existing DB comps."""
        PropertyService._fetch_market_snapshot(
            zip_code=prop.zip_code,
            property_type=prop.property_type,
            property_id=prop.id,
        )
        return PropertyComp.query.filter_by(property_id=prop.id).all()

    @staticmethod
    def _fetch_market_snapshot(zip_code: str, property_type: str, property_id: Optional[str] = None) -> list:
        """Build comparable sales list from internal data sources only."""
        comps = []

        db_comps_by_zip = (
            db.session.query(PropertyComp)
            .join(Property, Property.id == PropertyComp.property_id)
            .filter(Property.zip_code == zip_code)
            .order_by(PropertyComp.sale_date.desc(), PropertyComp.created_at.desc())
            .limit(120)
            .all()
        )
        for comp in db_comps_by_zip:
            if property_id and comp.property_id == property_id:
                continue
            comps.append(
                {
                    "address": comp.address,
                    "sale_price": comp.sale_price,
                    "sqft": comp.sqft,
                    "bedrooms": comp.bedrooms,
                    "bathrooms": comp.bathrooms,
                    "price_per_sqft": comp.price_per_sqft,
                    "sale_date": comp.sale_date,
                    "distance_miles": comp.distance_miles,
                    "latitude": comp.latitude,
                    "longitude": comp.longitude,
                    "property_type": property_type,
                    "year_built": None,
                    "source": comp.source or "internal_comp",
                }
            )

        if property_id:
            db_comps = PropertyComp.query.filter_by(property_id=property_id).all()
            if db_comps:
                return [
                    {
                        "address": c.address,
                        "sale_price": c.sale_price,
                        "sqft": c.sqft,
                        "bedrooms": c.bedrooms,
                        "bathrooms": c.bathrooms,
                        "price_per_sqft": c.price_per_sqft,
                        "sale_date": c.sale_date,
                        "distance_miles": c.distance_miles,
                        "latitude": c.latitude,
                        "longitude": c.longitude,
                        "property_type": property_type,
                        "year_built": None,
                        "source": c.source,
                    }
                    for c in db_comps
                ]

        # Fallback to local properties in the same zip as synthetic comps.
        local_props = Property.query.filter_by(zip_code=zip_code).order_by(Property.last_analyzed_at.desc(), Property.created_at.desc()).limit(80).all()
        for lp in local_props:
            baseline = lp.estimated_value or lp.listing_price
            if not baseline:
                continue
            if property_type and lp.property_type and lp.property_type != property_type:
                # Keep small share of off-type comps for sparse markets.
                if len(comps) >= 20:
                    continue
            pps = None
            if lp.sqft and lp.sqft > 0:
                pps = (Decimal(str(baseline)) / Decimal(str(lp.sqft))).quantize(Decimal("0.01"))
            comps.append(
                {
                    "address": lp.address,
                    "sale_price": Decimal(str(baseline)),
                    "sqft": lp.sqft,
                    "bedrooms": lp.bedrooms,
                    "bathrooms": lp.bathrooms,
                    "price_per_sqft": pps,
                    "sale_date": date.today(),
                    "distance_miles": None,
                    "latitude": lp.latitude,
                    "longitude": lp.longitude,
                    "property_type": lp.property_type,
                    "year_built": lp.year_built,
                    "source": "internal_zip_fallback",
                }
            )

        return comps[:120]

    @staticmethod
    def _compute_area_avg_from_dicts(comps: list):
        prices = [Decimal(str(c.get("sale_price"))) for c in comps if c.get("sale_price")]
        sqft_prices = [Decimal(str(c.get("price_per_sqft"))) for c in comps if c.get("price_per_sqft")]
        avg = sum(prices) / len(prices) if prices else None
        avg_sqft = sum(sqft_prices) / len(sqft_prices) if sqft_prices else None
        return (
            avg.quantize(Decimal("0.01")) if avg else None,
            avg_sqft.quantize(Decimal("0.01")) if avg_sqft else None,
        )

    @staticmethod
    def _compute_area_avg(prop: Property, comps: list):
        if not comps:
            return None, None
        prices = [Decimal(str(c.sale_price)) for c in comps if c.sale_price]
        sqft_prices = [Decimal(str(c.price_per_sqft)) for c in comps if c.price_per_sqft]
        avg = sum(prices) / len(prices) if prices else None
        avg_sqft = sum(sqft_prices) / len(sqft_prices) if sqft_prices else None
        return (
            avg.quantize(Decimal("0.01")) if avg else None,
            avg_sqft.quantize(Decimal("0.01")) if avg_sqft else None,
        )

    @staticmethod
    def _estimate_value(prop: Property, area_avg, area_avg_sqft) -> Optional[Decimal]:
        if prop.sqft and area_avg_sqft:
            return (Decimal(str(prop.sqft)) * area_avg_sqft).quantize(Decimal("0.01"))
        return area_avg

    @staticmethod
    def _estimate_rent(prop: Property) -> Optional[Decimal]:
        """Internal rent estimate based on property type monthly yield."""
        base = prop.estimated_value or prop.listing_price
        if not base:
            return None
        return (base * PropertyService._rent_yield_for_type(prop.property_type)).quantize(Decimal("0.01"))

    @staticmethod
    def _estimate_mortgage(price, down_payment_pct=Decimal("20"), annual_rate_pct=Decimal("7"), years=30) -> Optional[Decimal]:
        if not price:
            return None

        price_dec = Decimal(str(price))
        if price_dec <= 0:
            return None

        down_pct = Decimal(str(down_payment_pct)) / Decimal("100")
        down_pct = max(Decimal("0"), min(down_pct, Decimal("0.99")))
        loan = price_dec * (Decimal("1") - down_pct)

        monthly_rate = (Decimal(str(annual_rate_pct)) / Decimal("100")) / Decimal("12")
        periods = int(years) * 12
        if periods <= 0:
            periods = 360
        if monthly_rate <= 0:
            return (loan / Decimal(periods)).quantize(Decimal("0.01"))

        factor = (monthly_rate * (Decimal("1") + monthly_rate) ** periods) / ((Decimal("1") + monthly_rate) ** periods - Decimal("1"))
        return (loan * factor).quantize(Decimal("0.01"))

    @staticmethod
    def _estimate_property_tax(price) -> Optional[Decimal]:
        if not price:
            return None
        annual_tax = Decimal(str(price)) * Decimal("0.012")
        return (annual_tax / Decimal("12")).quantize(Decimal("0.01"))

    @staticmethod
    def _enrich_from_address(address: str) -> dict:
        """Local enrichment only. Parse zip from address and leave other fields unchanged."""
        fallback = {
            "zip_code": _extract_zip(address),
            "city": None,
            "state": None,
            "sqft": None,
            "lot_size_sqft": None,
            "latitude": None,
            "longitude": None,
            "year_built": None,
            "bedrooms": None,
            "bathrooms": None,
            "property_type": None,
            "listing_price": None,
        }
        return fallback

    @staticmethod
    def _normalize_property_inputs(data: dict) -> dict:
        address = str(data.get("address") or "").strip()
        if not address:
            raise ValueError("address required")

        enriched = PropertyService._enrich_from_address(address)
        zip_code = str(data.get("zip_code") or enriched.get("zip_code") or "").strip()
        if not zip_code:
            raise ValueError("zip_code required")

        normalized = {
            "address": address,
            "zip_code": zip_code,
            "city": data.get("city") or enriched.get("city"),
            "state": data.get("state") or enriched.get("state"),
            "property_type": data.get("property_type") or enriched.get("property_type") or "single_family",
            "bedrooms": _to_int(data.get("bedrooms") or enriched.get("bedrooms")),
            "bathrooms": _to_decimal(data.get("bathrooms") or enriched.get("bathrooms")),
            "sqft": _to_int(data.get("sqft") or enriched.get("sqft")),
            "lot_size_sqft": _to_int(data.get("lot_size_sqft") or enriched.get("lot_size_sqft")),
            "latitude": _to_decimal(data.get("latitude") or enriched.get("latitude")),
            "longitude": _to_decimal(data.get("longitude") or enriched.get("longitude")),
            "year_built": _to_int(data.get("year_built") or enriched.get("year_built")),
            "listing_price": _to_decimal(data.get("listing_price") or enriched.get("listing_price")),
            "notes": data.get("notes"),
            "source": data.get("source", "manual"),
            "status": data.get("status", "watching"),
        }
        return normalized

    @staticmethod
    def _normalize_comp_inputs(comps: list, property_type: str) -> list:
        normalized = []
        for comp in comps:
            if not isinstance(comp, dict):
                continue
            sale_price = _to_decimal(comp.get("sale_price"))
            if sale_price is None or sale_price <= 0:
                continue

            sqft = _to_int(comp.get("sqft"))
            ppsf = _to_decimal(comp.get("price_per_sqft"))
            if ppsf is None and sqft and sqft > 0:
                ppsf = (sale_price / Decimal(str(sqft))).quantize(Decimal("0.01"))

            normalized.append(
                {
                    "address": str(comp.get("address") or "").strip() or "Unknown comp",
                    "sale_price": sale_price,
                    "sqft": sqft,
                    "bedrooms": _to_int(comp.get("bedrooms")),
                    "bathrooms": _to_decimal(comp.get("bathrooms")),
                    "price_per_sqft": ppsf,
                    "sale_date": comp.get("sale_date") or date.today(),
                    "distance_miles": _to_decimal(comp.get("distance_miles")),
                    "latitude": _to_decimal(comp.get("latitude")),
                    "longitude": _to_decimal(comp.get("longitude")),
                    "property_type": comp.get("property_type") or property_type,
                    "year_built": _to_int(comp.get("year_built")),
                    "source": comp.get("source") or "scraped_comp",
                }
            )
        return normalized

    @staticmethod
    def _distance_miles(subject_lat, subject_lng, comp_lat, comp_lng) -> Optional[Decimal]:
        if subject_lat is None or subject_lng is None or comp_lat is None or comp_lng is None:
            return None
        try:
            lat1 = math.radians(float(subject_lat))
            lng1 = math.radians(float(subject_lng))
            lat2 = math.radians(float(comp_lat))
            lng2 = math.radians(float(comp_lng))

            d_lat = lat2 - lat1
            d_lng = lng2 - lng1
            a = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lng / 2) ** 2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            return Decimal(str(3958.8 * c)).quantize(Decimal("0.01"))
        except Exception:
            return None

    @staticmethod
    def _confidence_score(comps_count: int, has_sqft: bool, has_listing: bool, has_city_state: bool) -> int:
        score = 25
        score += min(comps_count, 12) * 4
        if has_sqft:
            score += 10
        if has_listing:
            score += 10
        if has_city_state:
            score += 7
        return max(1, min(score, 99))

    @staticmethod
    def _confidence_label(score: int) -> str:
        if score >= 80:
            return "HIGH"
        if score >= 55:
            return "MEDIUM"
        return "LOW"

    @staticmethod
    def _neighborhood_trend(price_deviation_pct: Optional[Decimal], comps_count: int) -> str:
        if comps_count < 3:
            return "insufficient_data"
        if price_deviation_pct is None:
            return "stable"
        if price_deviation_pct <= Decimal("-5"):
            return "undervalued_cluster"
        if price_deviation_pct >= Decimal("10"):
            return "heated_market"
        return "stable"

    @staticmethod
    def _appreciation_trend(area_avg_sqft: Optional[Decimal]) -> str:
        if not area_avg_sqft:
            return "unknown"
        if area_avg_sqft >= Decimal("280"):
            return "strong"
        if area_avg_sqft >= Decimal("180"):
            return "moderate"
        return "flat"

    @staticmethod
    def _risk_level(confidence_score: int, price_deviation_pct: Optional[Decimal]) -> str:
        if confidence_score < 45:
            return "high"
        if price_deviation_pct is not None and price_deviation_pct > Decimal("15"):
            return "high"
        if confidence_score < 70:
            return "medium"
        return "low"


def _normalize_property_type(raw_type: Optional[str]) -> Optional[str]:
    if not raw_type:
        return None
    token = str(raw_type).strip().lower()
    if "single" in token or "house" in token:
        return "single_family"
    if "condo" in token or "co-op" in token or "apartment" in token:
        return "condo"
    if "multi" in token or "duplex" in token or "triplex" in token:
        return "multi_family"
    if "land" in token or "lot" in token:
        return "land"
    if "commercial" in token:
        return "commercial"
    return "single_family"


def _extract_zip(address: str) -> Optional[str]:
    if not address:
        return None
    match = re.search(r"\b(\d{5})(?:-\d{4})?\b", address)
    return match.group(1) if match else None


def _to_decimal(value) -> Optional[Decimal]:
    if value is None:
        return None
    candidate = str(value).strip().replace(",", "")
    if not candidate:
        return None
    try:
        return Decimal(candidate)
    except Exception:
        return None


def _to_int(value) -> Optional[int]:
    if value is None:
        return None
    candidate = str(value).strip().replace(",", "")
    if not candidate:
        return None
    try:
        return int(float(candidate))
    except Exception:
        return None
