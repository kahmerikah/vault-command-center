"""Headless Selenium property scraper for comp ingestion.

Targets Zillow and Realtor search pages for a market query and extracts
comparable listing signals into normalized comp records.

Anti-bot resilience:
  - Rotating user-agent pool
  - Configurable HTTP proxy (SCRAPER_PROXY env var)
  - Retry with jittered exponential back-off per source
  - Source-specific DOM selectors with JSON-LD / NEXT_DATA fallback paths
  - Random inter-request delays
"""

from __future__ import annotations

import json
import logging
import math
import os
import random
import re
import time
from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

from backend.extensions import db
from backend.models.property import PropertyComp

logger = logging.getLogger(__name__)

# ── Rotating user agents ──────────────────────────────────────────────────
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
]

_RETRY_ATTEMPTS = 3
_RETRY_BASE_DELAY = 2.0   # seconds; will be jittered
_RETRY_MAX_DELAY = 20.0


class PropertyScraperService:
    @classmethod
    def scrape_market_comps(
        cls,
        *,
        address: str,
        zip_code: Optional[str],
        property_type: Optional[str],
        subject_latitude: Optional[float],
        subject_longitude: Optional[float],
        max_results: int = 12,
        headless: bool = True,
        proxy: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        query = (zip_code or address or "").strip()
        if not query:
            return []

        effective_proxy = proxy or os.getenv("SCRAPER_PROXY", "")

        harvested: List[Dict[str, Any]] = []
        harvested.extend(
            cls._scrape_zillow(
                query=query,
                property_type=property_type,
                max_results=max_results,
                headless=headless,
                subject_latitude=subject_latitude,
                subject_longitude=subject_longitude,
                proxy=effective_proxy,
            )
        )
        if len(harvested) < max_results:
            harvested.extend(
                cls._scrape_realtor(
                    query=query,
                    property_type=property_type,
                    max_results=max_results - len(harvested),
                    headless=headless,
                    subject_latitude=subject_latitude,
                    subject_longitude=subject_longitude,
                    proxy=effective_proxy,
                )
            )

        seen = set()
        deduped = []
        for comp in harvested:
            fingerprint = (comp.get("source"), comp.get("address"), str(comp.get("sale_price")))
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            deduped.append(comp)
            if len(deduped) >= max_results:
                break
        return deduped

    @classmethod
    def store_comps_for_property(cls, *, property_id: str, comps: List[Dict[str, Any]]) -> int:
        inserted = 0
        for comp in comps:
            sale_price = cls._to_decimal(comp.get("sale_price"))
            address = str(comp.get("address") or "").strip()
            if not sale_price or not address:
                continue

            row = PropertyComp(
                property_id=property_id,
                address=address,
                sale_price=sale_price,
                sqft=cls._to_int(comp.get("sqft")),
                bedrooms=cls._to_int(comp.get("bedrooms")),
                bathrooms=cls._to_decimal(comp.get("bathrooms")),
                price_per_sqft=cls._to_decimal(comp.get("price_per_sqft")),
                sale_date=cls._coerce_date(comp.get("sale_date")),
                distance_miles=cls._to_decimal(comp.get("distance_miles")),
                latitude=cls._to_decimal(comp.get("latitude")),
                longitude=cls._to_decimal(comp.get("longitude")),
                source=comp.get("source") or "selenium",
            )
            db.session.add(row)
            inserted += 1

        if inserted:
            db.session.flush()
        return inserted

    @classmethod
    def scrape_subject_property(
        cls,
        *,
        address: str,
        headless: bool = True,
        proxy: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Fetch the subject property's own details from Zillow (sqft, beds, baths, year, zestimate).

        Returns a dict with enrichment fields, or None if the page couldn't be scraped.
        """
        effective_proxy = proxy or os.getenv("SCRAPER_PROXY", "")
        url = f"https://www.zillow.com/homes/{quote_plus(address)}_rb/"
        page_source = cls._load_page_source_with_retry(url=url, headless=headless, proxy=effective_proxy)
        if not page_source:
            return None

        blobs = re.findall(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', page_source, flags=re.DOTALL)
        for blob in blobs:
            payload = cls._safe_json(blob)
            if not payload:
                continue
            text = json.dumps(payload)

            sqft_m = re.search(r'"livingArea"\s*:\s*([0-9]+)', text)
            if not sqft_m:
                continue
            sqft = cls._extract_number(sqft_m.group(1))
            if not sqft or sqft < 100:
                continue

            beds_m = re.search(r'"bedrooms"\s*:\s*([0-9]+)', text)
            baths_m = re.search(r'"bathrooms"\s*:\s*([0-9.]+)', text)
            year_m = re.search(r'"yearBuilt"\s*:\s*([0-9]{4})', text)
            zest_m = re.search(r'"zestimate"\s*:\s*([0-9]+)', text)
            rent_m = re.search(r'"rentZestimate"\s*:\s*([0-9]+)', text)
            lat_m = re.search(r'"latitude"\s*:\s*(-?[0-9]+\.[0-9]+)', text)
            lng_m = re.search(r'"longitude"\s*:\s*(-?[0-9]+\.[0-9]+)', text)

            return {
                "sqft": sqft,
                "bedrooms": cls._extract_number(beds_m.group(1)) if beds_m else None,
                "bathrooms": cls._extract_number(baths_m.group(1)) if baths_m else None,
                "year_built": cls._extract_number(year_m.group(1)) if year_m else None,
                "latitude": cls._extract_float(lat_m.group(1)) if lat_m else None,
                "longitude": cls._extract_float(lng_m.group(1)) if lng_m else None,
                "zestimate": cls._extract_number(zest_m.group(1)) if zest_m else None,
                "rent_zestimate": cls._extract_number(rent_m.group(1)) if rent_m else None,
                "source": "zillow_selenium",
            }

        return None

    @classmethod
    def _scrape_zillow(
        cls,
        *,
        query: str,
        property_type: Optional[str],
        max_results: int,
        headless: bool,
        subject_latitude: Optional[float],
        subject_longitude: Optional[float],
        proxy: str = "",
    ) -> List[Dict[str, Any]]:
        url = f"https://www.zillow.com/homes/recently_sold/{quote_plus(query)}_rb/"
        page_source = cls._load_page_source_with_retry(url=url, headless=headless, proxy=proxy)
        if not page_source:
            return []

        comps: List[Dict[str, Any]] = []

        # --- Path 1: __NEXT_DATA__ JSON blob (current Zillow SPA) ---
        blobs = re.findall(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', page_source, flags=re.DOTALL)
        if blobs:
            payload = cls._safe_json(blobs[0])
            if payload:
                text = json.dumps(payload)
                # Each listing card with a price field
                for match in re.finditer(
                    r'\{[^}{]{0,600}?"price"\s*:\s*"?\$?([0-9,]+)"?[^}{]{0,600}?\}',
                    text,
                ):
                    card = match.group(0)
                    price = cls._extract_number(
                        re.search(r'"price"\s*:\s*"?\$?([0-9,]+)"?', card).group(1)
                        if re.search(r'"price"\s*:\s*"?\$?([0-9,]+)"?', card)
                        else None
                    )
                    addr = (
                        cls._extract_string(card, "address")
                        or cls._extract_string(card, "streetAddress")
                        or cls._extract_string(card, "addressLine1")
                    )
                    beds = cls._extract_number(cls._extract_string(card, "beds") or cls._extract_string(card, "bedrooms"))
                    baths = cls._extract_number(cls._extract_string(card, "baths") or cls._extract_string(card, "bathrooms"))
                    sqft = cls._extract_number(cls._extract_string(card, "area") or cls._extract_string(card, "livingArea"))
                    lat = cls._extract_float(cls._extract_string(card, "latitude") or cls._extract_string(card, "lat"))
                    lng = cls._extract_float(cls._extract_string(card, "longitude") or cls._extract_string(card, "lon"))
                    if not price or not addr:
                        continue

                    ppsf = cls._compute_ppsf(price=price, sqft=sqft)
                    distance_miles = cls._distance_miles(subject_latitude, subject_longitude, lat, lng)
                    comps.append({
                        "address": addr,
                        "sale_price": str(price),
                        "sqft": sqft,
                        "bedrooms": beds,
                        "bathrooms": baths,
                        "price_per_sqft": str(ppsf) if ppsf is not None else None,
                        "sale_date": date.today().isoformat(),
                        "distance_miles": str(distance_miles) if distance_miles is not None else None,
                        "latitude": str(lat) if lat is not None else None,
                        "longitude": str(lng) if lng is not None else None,
                        "property_type": property_type,
                        "source": "zillow_selenium",
                    })
                    if len(comps) >= max_results:
                        break

        # --- Path 2: JSON-LD structured data (fallback) ---
        if not comps:
            for ld_block in re.findall(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', page_source, flags=re.DOTALL):
                ld = cls._safe_json(ld_block)
                if not ld:
                    continue
                items = ld if isinstance(ld, list) else [ld]
                for item in items:
                    if item.get("@type") not in ("SingleFamilyResidence", "House", "Residence", "Place"):
                        continue
                    offers = item.get("offers") or {}
                    price = cls._extract_number(offers.get("price"))
                    addr_obj = item.get("address") or {}
                    addr = (
                        addr_obj.get("streetAddress")
                        or item.get("name")
                    )
                    lat = cls._extract_float(item.get("latitude") or (item.get("geo") or {}).get("latitude"))
                    lng = cls._extract_float(item.get("longitude") or (item.get("geo") or {}).get("longitude"))
                    if not price or not addr:
                        continue

                    distance_miles = cls._distance_miles(subject_latitude, subject_longitude, lat, lng)
                    comps.append({
                        "address": addr,
                        "sale_price": str(price),
                        "sqft": cls._extract_number(item.get("floorSize", {}).get("value") if isinstance(item.get("floorSize"), dict) else item.get("floorSize")),
                        "bedrooms": cls._extract_number(item.get("numberOfRooms")),
                        "bathrooms": None,
                        "price_per_sqft": None,
                        "sale_date": date.today().isoformat(),
                        "distance_miles": str(distance_miles) if distance_miles is not None else None,
                        "latitude": str(lat) if lat is not None else None,
                        "longitude": str(lng) if lng is not None else None,
                        "property_type": property_type,
                        "source": "zillow_selenium_ld",
                    })
                    if len(comps) >= max_results:
                        break
                if len(comps) >= max_results:
                    break

        return comps

    @classmethod
    def _scrape_realtor(
        cls,
        *,
        query: str,
        property_type: Optional[str],
        max_results: int,
        headless: bool,
        subject_latitude: Optional[float],
        subject_longitude: Optional[float],
        proxy: str = "",
    ) -> List[Dict[str, Any]]:
        url = f"https://www.realtor.com/realestateandhomes-search/{quote_plus(query)}/show-recently-sold"
        page_source = cls._load_page_source_with_retry(url=url, headless=headless, proxy=proxy)
        if not page_source:
            return []

        comps: List[Dict[str, Any]] = []

        # --- Path 1: Bootstrap JSON embedded in page ---
        for blob in re.findall(r'window\.__PRELOADED_STATE__\s*=\s*(\{.*?\});?\s*</script>', page_source, flags=re.DOTALL):
            payload = cls._safe_json(blob)
            if not payload:
                continue
            text = json.dumps(payload)
            for match in re.finditer(
                r'\{[^}{]{0,600}?"list_price"\s*:\s*([0-9]+)[^}{]{0,600}?\}',
                text,
            ):
                card = match.group(0)
                price = cls._extract_number(cls._extract_string(card, "list_price") or re.search(r'"list_price"\s*:\s*([0-9]+)', card).group(1) if re.search(r'"list_price"\s*:\s*([0-9]+)', card) else None)
                addr = (
                    cls._extract_string(card, "line")
                    or cls._extract_string(card, "street_address")
                    or cls._extract_string(card, "address")
                )
                beds = cls._extract_number(cls._extract_string(card, "beds") or cls._extract_string(card, "bedrooms"))
                baths = cls._extract_number(cls._extract_string(card, "baths") or cls._extract_string(card, "bathrooms"))
                sqft = cls._extract_number(cls._extract_string(card, "sqft") or cls._extract_string(card, "sqft_floorplan"))
                lat = cls._extract_float(cls._extract_string(card, "lat") or cls._extract_string(card, "latitude"))
                lng = cls._extract_float(cls._extract_string(card, "lon") or cls._extract_string(card, "longitude"))
                if not price or not addr:
                    continue

                ppsf = cls._compute_ppsf(price=price, sqft=sqft)
                distance_miles = cls._distance_miles(subject_latitude, subject_longitude, lat, lng)
                comps.append({
                    "address": addr,
                    "sale_price": str(price),
                    "sqft": sqft,
                    "bedrooms": beds,
                    "bathrooms": baths,
                    "price_per_sqft": str(ppsf) if ppsf is not None else None,
                    "sale_date": date.today().isoformat(),
                    "distance_miles": str(distance_miles) if distance_miles is not None else None,
                    "latitude": str(lat) if lat is not None else None,
                    "longitude": str(lng) if lng is not None else None,
                    "property_type": property_type,
                    "source": "realtor_selenium",
                })
                if len(comps) >= max_results:
                    break
            if comps:
                break

        # --- Path 2: JSON-LD ---
        if not comps:
            for ld_block in re.findall(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', page_source, flags=re.DOTALL):
                ld = cls._safe_json(ld_block)
                if not ld:
                    continue
                items = ld if isinstance(ld, list) else [ld]
                for item in items:
                    if item.get("@type") not in ("SingleFamilyResidence", "House", "Residence", "RealEstateListing"):
                        continue
                    price = cls._extract_number((item.get("offers") or {}).get("price"))
                    addr_obj = item.get("address") or {}
                    addr = addr_obj.get("streetAddress") or item.get("name")
                    lat = cls._extract_float(item.get("latitude"))
                    lng = cls._extract_float(item.get("longitude"))
                    if not price or not addr:
                        continue

                    distance_miles = cls._distance_miles(subject_latitude, subject_longitude, lat, lng)
                    comps.append({
                        "address": addr,
                        "sale_price": str(price),
                        "sqft": None,
                        "bedrooms": cls._extract_number(item.get("numberOfRooms")),
                        "bathrooms": None,
                        "price_per_sqft": None,
                        "sale_date": date.today().isoformat(),
                        "distance_miles": str(distance_miles) if distance_miles is not None else None,
                        "latitude": str(lat) if lat is not None else None,
                        "longitude": str(lng) if lng is not None else None,
                        "property_type": property_type,
                        "source": "realtor_selenium_ld",
                    })
                    if len(comps) >= max_results:
                        break
                if comps:
                    break

        return comps

    @classmethod
    def _load_page_source_with_retry(
        cls,
        *,
        url: str,
        headless: bool,
        proxy: str = "",
    ) -> Optional[str]:
        """Attempt to load page source with jittered exponential back-off retry."""
        for attempt in range(1, _RETRY_ATTEMPTS + 1):
            source = cls._load_page_source(url=url, headless=headless, proxy=proxy)
            if source:
                return source

            if attempt < _RETRY_ATTEMPTS:
                delay = min(_RETRY_BASE_DELAY * (2 ** (attempt - 1)) + random.uniform(0, 1.5), _RETRY_MAX_DELAY)
                logger.debug("Scraper retry %d/%d for %s — waiting %.1fs", attempt, _RETRY_ATTEMPTS, url, delay)
                time.sleep(delay)

        return None

    @classmethod
    def _load_page_source(
        cls,
        *,
        url: str,
        headless: bool,
        proxy: str = "",
    ) -> Optional[str]:
        """Spin up a Chrome driver with a random user-agent and optional proxy."""
        try:
            from selenium import webdriver
            from selenium.webdriver.chrome.options import Options
            from selenium.webdriver.chrome.service import Service
            try:
                from webdriver_manager.chrome import ChromeDriverManager
                _driver_manager_available = True
            except ImportError:
                _driver_manager_available = False
        except Exception:
            return None

        driver = None
        try:
            options = Options()
            if headless:
                options.add_argument("--headless=new")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-gpu")
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option("useAutomationExtension", False)
            options.add_argument("--window-size=1440,900")
            options.add_argument(f"--user-agent={random.choice(_USER_AGENTS)}")

            if proxy:
                options.add_argument(f"--proxy-server={proxy}")

            # Accept path override from env (for container deployments with pre-installed chromedriver)
            chromedriver_path = os.getenv("CHROMEDRIVER_PATH", "")
            if chromedriver_path:
                service = Service(executable_path=chromedriver_path)
            elif _driver_manager_available:
                service = Service(ChromeDriverManager().install())
            else:
                service = Service()

            driver = webdriver.Chrome(service=service, options=options)
            driver.set_page_load_timeout(25)

            # Mask webdriver property
            driver.execute_cdp_cmd(
                "Page.addScriptToEvaluateOnNewDocument",
                {"source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"},
            )

            # Add a small random delay before navigation to simulate human timing
            time.sleep(random.uniform(0.4, 1.2))
            driver.get(url)

            # Brief pause to allow JS-rendered content to settle
            time.sleep(random.uniform(1.5, 3.0))

            return driver.page_source
        except Exception as exc:
            logger.debug("Selenium page load failed for %s: %s", url, exc)
            return None
        finally:
            if driver is not None:
                try:
                    driver.quit()
                except Exception:
                    pass

    @staticmethod
    def _safe_json(raw: str) -> Optional[Dict[str, Any]]:
        try:
            return json.loads(raw)
        except Exception:
            return None

    @staticmethod
    def _extract_string(text: str, key: str) -> Optional[str]:
        if not text:
            return None
        pattern = rf'"{re.escape(key)}"\s*:\s*"([^\"]+)"'
        m = re.search(pattern, text)
        if not m:
            return None
        return m.group(1)

    @staticmethod
    def _extract_number(value: Any) -> Optional[int]:
        if value is None:
            return None
        token = re.sub(r"[^0-9.]", "", str(value))
        if not token:
            return None
        try:
            return int(float(token))
        except Exception:
            return None

    @staticmethod
    def _extract_float(value: Any) -> Optional[float]:
        if value is None:
            return None
        token = re.sub(r"[^0-9.\-]", "", str(value))
        if not token:
            return None
        try:
            return float(token)
        except Exception:
            return None

    @staticmethod
    def _compute_ppsf(*, price: Optional[int], sqft: Optional[int]) -> Optional[Decimal]:
        if not price or not sqft or sqft <= 0:
            return None
        try:
            return (Decimal(str(price)) / Decimal(str(sqft))).quantize(Decimal("0.01"))
        except Exception:
            return None

    @staticmethod
    def _distance_miles(
        subject_latitude: Optional[float],
        subject_longitude: Optional[float],
        comp_latitude: Optional[float],
        comp_longitude: Optional[float],
    ) -> Optional[Decimal]:
        if subject_latitude is None or subject_longitude is None:
            return None
        if comp_latitude is None or comp_longitude is None:
            return None

        from math import atan2, cos, radians, sin, sqrt

        r = 3958.8
        d_lat = radians(comp_latitude - subject_latitude)
        d_lng = radians(comp_longitude - subject_longitude)
        lat1 = radians(subject_latitude)
        lat2 = radians(comp_latitude)

        a = sin(d_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(d_lng / 2) ** 2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return Decimal(str(r * c)).quantize(Decimal("0.01"))

    @staticmethod
    def _to_decimal(value: Any) -> Optional[Decimal]:
        if value is None:
            return None
        token = str(value).strip().replace(",", "")
        if not token:
            return None
        try:
            return Decimal(token)
        except Exception:
            return None

    @staticmethod
    def _to_int(value: Any) -> Optional[int]:
        if value is None:
            return None
        token = str(value).strip().replace(",", "")
        if not token:
            return None
        try:
            return int(float(token))
        except Exception:
            return None

    @staticmethod
    def _coerce_date(value: Any):
        if value is None:
            return date.today()
        if isinstance(value, date):
            return value
        token = str(value).strip()
        if not token:
            return date.today()
        try:
            return date.fromisoformat(token[:10])
        except Exception:
            return date.today()
