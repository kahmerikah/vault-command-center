"""Property Intelligence Engine.

Evaluates real estate properties against local comps to score deals.

External API (optional):
    Uses RapidAPI Zillow endpoint when RAPIDAPI_KEY + RAPIDAPI_HOST_ZILLOW are set.
    Falls back to internal comp database only if not configured.
"""
import os
import math
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
        """Estimate value/deal metrics from address + zip without saving a property."""
        zip_code = str(data.get("zip_code") or "").strip()
        address = str(data.get("address") or "").strip()
        if not address or not zip_code:
            raise ValueError("address and zip_code required")

        listing_price = Decimal(str(data["listing_price"])) if data.get("listing_price") else None
        sqft = int(data["sqft"]) if data.get("sqft") else None
        property_type = data.get("property_type", "single_family")

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
        monthly_mortgage_est = PropertyService._estimate_mortgage(listing_price or estimated_value)

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
        if (listing_price or estimated_value) and estimated_rent:
            purchase_price = listing_price or estimated_value
            annual_rent = estimated_rent * 12
            expenses_est = annual_rent * Decimal("0.35")
            noi = annual_rent - expenses_est
            if purchase_price and purchase_price > 0:
                cap_rate_pct = (noi / purchase_price * 100).quantize(Decimal("0.0001"))
                annual_net = noi - (monthly_mortgage_est or 0) * 12
                roi_estimate_pct = (annual_net / purchase_price * 100).quantize(Decimal("0.0001"))

        return {
            "address": address,
            "zip_code": zip_code,
            "property_type": property_type,
            "listing_price": str(listing_price) if listing_price is not None else None,
            "sqft": sqft,
            "area_avg_price": str(area_avg) if area_avg is not None else None,
            "area_avg_price_sqft": str(area_avg_sqft) if area_avg_sqft is not None else None,
            "estimated_value": str(estimated_value) if estimated_value is not None else None,
            "estimated_rent": str(estimated_rent) if estimated_rent is not None else None,
            "monthly_mortgage_est": str(monthly_mortgage_est) if monthly_mortgage_est is not None else None,
            "price_deviation_pct": str(price_deviation_pct) if price_deviation_pct is not None else None,
            "deal_verdict": deal_verdict,
            "deal_score": str(deal_score) if deal_score is not None else None,
            "cap_rate_pct": str(cap_rate_pct) if cap_rate_pct is not None else None,
            "roi_estimate_pct": str(roi_estimate_pct) if roi_estimate_pct is not None else None,
            "comps_used": len(comps),
            "comps": comps[:8],
        }

    @staticmethod
    def add_property(user_id: str, data: dict) -> Property:
        prop = Property(
            user_id=user_id,
            address=data["address"],
            city=data.get("city"),
            state=data.get("state"),
            zip_code=data["zip_code"],
            property_type=data.get("property_type", "single_family"),
            bedrooms=data.get("bedrooms"),
            bathrooms=data.get("bathrooms"),
            sqft=data.get("sqft"),
            lot_size_sqft=data.get("lot_size_sqft"),
            year_built=data.get("year_built"),
            listing_price=Decimal(str(data["listing_price"])) if data.get("listing_price") else None,
            notes=data.get("notes"),
            source=data.get("source", "manual"),
            status=data.get("status", "watching"),
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
    def _estimate_mortgage(price) -> Optional[Decimal]:
        """30yr fixed at 7% with 20% down."""
        if not price:
            return None
        loan = Decimal(str(price)) * Decimal("0.80")
        monthly_rate = Decimal("0.07") / 12
        n = 360
        factor = (monthly_rate * (1 + monthly_rate) ** n) / ((1 + monthly_rate) ** n - 1)
        return (loan * factor).quantize(Decimal("0.01"))


def _map_property_type(ptype: str) -> str:
    mapping = {
        "single_family": "Houses",
        "condo": "Apartments_Condos_Co-ops",
        "multi_family": "Multi-family",
        "land": "Lots-Land",
        "commercial": "Apartments_Condos_Co-ops",
    }
    return mapping.get(ptype, "Houses")
