"""Property Intelligence Engine.

Evaluates real estate properties against local comps to score deals.

External API (optional):
    Uses RapidAPI Zillow endpoint when RAPIDAPI_KEY + RAPIDAPI_HOST_ZILLOW are set.
    Falls back to internal comp database only if not configured.
"""
import os
import math
import re
import requests
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, date
from typing import Optional
from backend.extensions import db
from backend.models.property import Property, PropertyComp
from backend.services.activity_service import ActivityService


class PropertyService:
    DEAL_THRESHOLD_PCT = Decimal("5.0")   # within 5% of area avg = good deal

    @staticmethod
    def estimate_value(data: dict) -> dict:
        """Estimate value/deal metrics from address with optional zip override."""
        address = str(data.get("address") or "").strip()
        if not address:
            raise ValueError("address required")

        listing_price = _to_decimal(data.get("listing_price"))
        sqft = _to_int(data.get("sqft"))
        property_type = data.get("property_type") or "single_family"

        enriched = PropertyService._enrich_from_address(address)
        zip_code = str(data.get("zip_code") or enriched.get("zip_code") or "").strip()
        if not zip_code:
            raise ValueError("Could not infer zip_code. Add zip_code in advanced inputs.")

        city = data.get("city") or enriched.get("city")
        state = data.get("state") or enriched.get("state")
        bedrooms = _to_int(data.get("bedrooms") or enriched.get("bedrooms"))
        bathrooms = _to_decimal(data.get("bathrooms") or enriched.get("bathrooms"))
        lot_size_sqft = _to_int(data.get("lot_size_sqft") or enriched.get("lot_size_sqft"))
        year_built = _to_int(data.get("year_built") or enriched.get("year_built"))

        if not sqft and enriched.get("sqft"):
            sqft = _to_int(enriched.get("sqft"))
        if not data.get("property_type") and enriched.get("property_type"):
            property_type = enriched.get("property_type")
        if listing_price is None and enriched.get("listing_price") is not None:
            listing_price = _to_decimal(enriched.get("listing_price"))

        target_roi_pct = _to_decimal(data.get("target_roi_pct"))
        rehab_estimate = _to_decimal(data.get("rehab_estimate"))
        down_payment_pct = _to_decimal(data.get("down_payment_pct")) or Decimal("20")
        interest_rate_pct = _to_decimal(data.get("interest_rate_pct")) or Decimal("7")
        loan_years = _to_int(data.get("loan_years")) or 30
        expense_ratio_pct = _to_decimal(data.get("expense_ratio_pct")) or Decimal("35")

        comps = PropertyService._fetch_market_snapshot(
            zip_code=zip_code,
            property_type=property_type,
            property_id=None,
        )
        area_avg, area_avg_sqft = PropertyService._compute_area_avg_from_dicts(comps)

        estimated_value = None
        if sqft and area_avg_sqft:
            estimated_value = (Decimal(str(sqft)) * area_avg_sqft).quantize(Decimal("0.01"))
        elif area_avg:
            estimated_value = area_avg
        elif listing_price:
            estimated_value = listing_price

        estimated_rent = (estimated_value * Decimal("0.008")).quantize(Decimal("0.01")) if estimated_value else None
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
        if listing_price and area_avg and area_avg > 0:
            deviation = ((listing_price - area_avg) / area_avg * 100).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            price_deviation_pct = deviation
            if deviation <= PropertyService.DEAL_THRESHOLD_PCT:
                deal_verdict = "good_deal"
            elif deviation <= Decimal("15"):
                deal_verdict = "fair"
            else:
                deal_verdict = "overpriced"
            raw_score = max(Decimal("0"), Decimal("100") - (deviation + PropertyService.DEAL_THRESHOLD_PCT) * 2)
            deal_score = min(raw_score, Decimal("100")).quantize(Decimal("0.01"))

        cap_rate_pct = None
        roi_estimate_pct = None
        if purchase_price and estimated_rent:
            annual_rent = estimated_rent * 12
            expenses_est = annual_rent * (expense_ratio_pct / Decimal("100"))
            noi = annual_rent - expenses_est
            if purchase_price and purchase_price > 0:
                cap_rate_pct = (noi / purchase_price * 100).quantize(Decimal("0.0001"))
                annual_net = noi - (monthly_mortgage_est or 0) * 12
                roi_estimate_pct = (annual_net / purchase_price * 100).quantize(Decimal("0.0001"))

        confidence_score = PropertyService._confidence_score(
            comps_count=len(comps),
            has_sqft=bool(sqft),
            has_listing=bool(listing_price),
            has_city_state=bool(city and state),
        )
        confidence_label = PropertyService._confidence_label(confidence_score)

        neighborhood_trend = PropertyService._neighborhood_trend(price_deviation_pct, comps_count=len(comps))
        appreciation_trend = PropertyService._appreciation_trend(area_avg_sqft)
        risk_level = PropertyService._risk_level(confidence_score, price_deviation_pct)

        opportunity_classification = "monitor"
        if deal_verdict == "good_deal" and monthly_cash_flow_est and monthly_cash_flow_est > 0:
            opportunity_classification = "acquisition_candidate"
        elif deal_verdict == "overpriced":
            opportunity_classification = "avoid"

        return {
            "address": address,
            "zip_code": zip_code,
            "city": city,
            "state": state,
            "property_type": property_type,
            "bedrooms": bedrooms,
            "bathrooms": str(bathrooms) if bathrooms is not None else None,
            "lot_size_sqft": lot_size_sqft,
            "year_built": year_built,
            "listing_price": str(listing_price) if listing_price is not None else None,
            "sqft": sqft,
            "area_avg_price": str(area_avg) if area_avg is not None else None,
            "area_avg_price_sqft": str(area_avg_sqft) if area_avg_sqft is not None else None,
            "estimated_value": str(estimated_value) if estimated_value is not None else None,
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
            "target_roi_pct": str(target_roi_pct) if target_roi_pct is not None else None,
            "rehab_estimate": str(rehab_estimate) if rehab_estimate is not None else None,
            "comps_used": len(comps),
            "comps": comps[:8],
        }

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
            user_id=user_id,
            message=f"Property added: {prop.address} ({prop.zip_code})",
            level="info",
        )
        return prop

    @staticmethod
    def analyze(prop: Property) -> Property:
        """Fetch comps (external + DB), run valuation, update deal score."""
        comps = PropertyService._fetch_comps(prop)
        area_avg, area_avg_sqft = PropertyService._compute_area_avg(prop, comps)

        prop.area_avg_price = area_avg
        prop.area_avg_price_sqft = area_avg_sqft
        prop.estimated_value = PropertyService._estimate_value(prop, area_avg, area_avg_sqft)
        prop.estimated_rent = PropertyService._estimate_rent(prop)
        prop.monthly_mortgage_est = PropertyService._estimate_mortgage(prop.listing_price)
        prop.last_analyzed_at = datetime.utcnow()

        if prop.listing_price and area_avg and area_avg > 0:
            deviation = ((prop.listing_price - area_avg) / area_avg * 100).quantize(
                Decimal("0.0001"), rounding=ROUND_HALF_UP
            )
            prop.price_deviation_pct = deviation
            if deviation <= PropertyService.DEAL_THRESHOLD_PCT:
                prop.deal_verdict = "good_deal"
            elif deviation <= Decimal("15"):
                prop.deal_verdict = "fair"
            else:
                prop.deal_verdict = "overpriced"
            # Score: 100 = perfect deal (at or below avg), decreases linearly
            raw_score = max(Decimal("0"), Decimal("100") - (deviation + PropertyService.DEAL_THRESHOLD_PCT) * 2)
            prop.deal_score = min(raw_score, Decimal("100")).quantize(Decimal("0.01"))
        else:
            prop.deal_verdict = "unknown"
            prop.deal_score = None

        # ROI / Cap Rate estimation
        if prop.listing_price and prop.listing_price > 0 and prop.estimated_rent:
            annual_rent = prop.estimated_rent * 12
            expenses_est = annual_rent * Decimal("0.35")  # 35% expense ratio estimate
            noi = annual_rent - expenses_est
            prop.cap_rate_pct = (noi / prop.listing_price * 100).quantize(Decimal("0.0001"))
            annual_net = noi - (prop.monthly_mortgage_est or 0) * 12
            prop.roi_estimate_pct = (annual_net / prop.listing_price * 100).quantize(Decimal("0.0001"))

        return prop

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
        """Fetch comparable sales for a zip code and optionally persist against a property."""
        api_key = os.getenv("RAPIDAPI_KEY", "")
        host = os.getenv("RAPIDAPI_HOST_ZILLOW", "zillow-com1.p.rapidapi.com")
        comps = []
        if api_key:
            try:
                url = f"https://{host}/propertyExtendedSearch"
                params = {
                    "location": zip_code,
                    "home_type": _map_property_type(property_type),
                    "status_type": "RecentlySold",
                    "sort": "Newest",
                }
                resp = requests.get(
                    url,
                    headers={"X-RapidAPI-Key": api_key, "X-RapidAPI-Host": host},
                    params=params,
                    timeout=10,
                )
                if resp.ok:
                    results = resp.json().get("props") or []
                    for r in results[:20]:
                        price = r.get("price") or r.get("lastSoldPrice")
                        sqft = r.get("livingArea")
                        if not price:
                            continue
                        price_dec = Decimal(str(price))
                        pps = (price_dec / Decimal(str(sqft))).quantize(Decimal("0.01")) if sqft else None
                        comp_data = {
                            "address": r.get("address", ""),
                            "sale_price": price_dec,
                            "sqft": sqft,
                            "bedrooms": r.get("bedrooms"),
                            "bathrooms": r.get("bathrooms"),
                            "price_per_sqft": pps,
                            "sale_date": date.today(),
                            "source": "zillow_rapidapi",
                        }
                        comps.append(comp_data)

                        if property_id:
                            comp = PropertyComp(property_id=property_id, **comp_data)
                            db.session.add(comp)
                    if property_id and comps:
                        db.session.flush()
            except Exception:
                pass

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
                        "source": c.source,
                    }
                    for c in db_comps
                ]

        # Fallback to local comps in same zip when external API is unavailable.
        if not comps:
            local_props = Property.query.filter_by(zip_code=zip_code).order_by(Property.created_at.desc()).limit(25).all()
            for lp in local_props:
                baseline = lp.estimated_value or lp.listing_price
                if not baseline:
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
                        "source": "internal_zip_fallback",
                    }
                )
        return comps

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
        """Rough rent estimate: 0.8% of estimated value per month."""
        base = prop.estimated_value or prop.listing_price
        if not base:
            return None
        return (base * Decimal("0.008")).quantize(Decimal("0.01"))

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
        """Best-effort enrichment from external listing API based on address-like location."""
        api_key = os.getenv("RAPIDAPI_KEY", "")
        host = os.getenv("RAPIDAPI_HOST_ZILLOW", "zillow-com1.p.rapidapi.com")

        fallback = {
            "zip_code": _extract_zip(address),
            "city": None,
            "state": None,
            "sqft": None,
            "lot_size_sqft": None,
            "year_built": None,
            "bedrooms": None,
            "bathrooms": None,
            "property_type": None,
            "listing_price": None,
        }

        if not api_key:
            return fallback

        try:
            url = f"https://{host}/propertyExtendedSearch"
            resp = requests.get(
                url,
                headers={"X-RapidAPI-Key": api_key, "X-RapidAPI-Host": host},
                params={"location": address, "status_type": "ForSale", "sort": "Newest"},
                timeout=10,
            )
            if not resp.ok:
                return fallback

            props = resp.json().get("props") or []
            if not props:
                return fallback

            best = props[0]
            fallback.update(
                {
                    "zip_code": str(
                        best.get("zipcode")
                        or best.get("zipCode")
                        or best.get("zip")
                        or fallback.get("zip_code")
                        or ""
                    ).strip() or fallback.get("zip_code"),
                    "city": best.get("city"),
                    "state": best.get("state") or best.get("stateCode"),
                    "sqft": best.get("livingArea"),
                    "lot_size_sqft": best.get("lotAreaValue"),
                    "year_built": best.get("yearBuilt"),
                    "bedrooms": best.get("bedrooms"),
                    "bathrooms": best.get("bathrooms"),
                    "property_type": _normalize_property_type(best.get("homeType") or best.get("propertyType")),
                    "listing_price": best.get("price"),
                }
            )
        except Exception:
            return fallback

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
            "year_built": _to_int(data.get("year_built") or enriched.get("year_built")),
            "listing_price": _to_decimal(data.get("listing_price") or enriched.get("listing_price")),
            "notes": data.get("notes"),
            "source": data.get("source", "manual"),
            "status": data.get("status", "watching"),
        }
        return normalized

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


def _map_property_type(ptype: str) -> str:
    mapping = {
        "single_family": "Houses",
        "condo": "Apartments_Condos_Co-ops",
        "multi_family": "Multi-family",
        "land": "Lots-Land",
        "commercial": "Apartments_Condos_Co-ops",
    }
    return mapping.get(ptype, "Houses")


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
