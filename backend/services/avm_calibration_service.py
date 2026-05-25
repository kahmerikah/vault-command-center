"""AVM calibration storage and merge utilities.

Calibration is persisted as JSON to avoid requiring immediate DB migrations,
and can be tuned per market (zip/city/state + property type).
"""

from __future__ import annotations

import json
import threading
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, Optional


_DEFAULT_CALIBRATION: Dict[str, Any] = {
    "weights": {
        "type_match_bonus": 0.35,
        "type_related_bonus": 0.15,
        "type_mismatch_penalty": 0.20,
        "sqft_weight": 0.70,
        "bed_weight": 0.08,
        "bath_weight": 0.06,
        "year_weight": 1 / 240,
        "distance_close_bonus_025": 0.25,
        "distance_close_bonus_05": 0.15,
        "distance_close_bonus_1": 0.05,
        "distance_far_penalty_3": 0.20,
        "distance_penalty_per_mile": 0.07,
    },
    "bounds": {
        "sqft_floor": 0.55,
        "bed_floor": 0.70,
        "bath_floor": 0.75,
        "year_floor": 0.75,
        "similarity_min": 0.05,
        "similarity_max": 2.5,
    },
}


class AVMCalibrationService:
    _lock = threading.Lock()
    _cache: Optional[Dict[str, Any]] = None

    @classmethod
    def get_default(cls) -> Dict[str, Any]:
        return deepcopy(_DEFAULT_CALIBRATION)

    @classmethod
    def market_key(
        cls,
        *,
        zip_code: Optional[str],
        city: Optional[str],
        state: Optional[str],
        property_type: Optional[str],
    ) -> str:
        return "|".join(
            [
                f"zip:{str(zip_code or '').strip().lower()}",
                f"city:{str(city or '').strip().lower()}",
                f"state:{str(state or '').strip().lower()}",
                f"type:{str(property_type or 'single_family').strip().lower()}",
            ]
        )

    @classmethod
    def get_for_market(
        cls,
        *,
        zip_code: Optional[str],
        city: Optional[str],
        state: Optional[str],
        property_type: Optional[str],
    ) -> Dict[str, Any]:
        payload = cls._read_store()
        defaults = cls.get_default()

        targets = [
            cls.market_key(zip_code=zip_code, city=city, state=state, property_type=property_type),
            cls.market_key(zip_code=zip_code, city=None, state=state, property_type=property_type),
            cls.market_key(zip_code=None, city=city, state=state, property_type=property_type),
            cls.market_key(zip_code=None, city=None, state=state, property_type=property_type),
            cls.market_key(zip_code=None, city=None, state=None, property_type=property_type),
        ]

        merged = defaults
        for key in targets:
            override = (payload.get("markets") or {}).get(key)
            if override:
                merged = cls._deep_merge(merged, override)
        return merged

    @classmethod
    def upsert_market(cls, *, market: Dict[str, Any], calibration: Dict[str, Any]) -> Dict[str, Any]:
        key = cls.market_key(
            zip_code=market.get("zip_code"),
            city=market.get("city"),
            state=market.get("state"),
            property_type=market.get("property_type"),
        )

        payload = cls._read_store()
        markets = payload.setdefault("markets", {})

        previous = markets.get(key, {})
        markets[key] = cls._deep_merge(previous, calibration)

        cls._write_store(payload)

        return {
            "market_key": key,
            "market": {
                "zip_code": market.get("zip_code"),
                "city": market.get("city"),
                "state": market.get("state"),
                "property_type": market.get("property_type") or "single_family",
            },
            "calibration": cls.get_for_market(
                zip_code=market.get("zip_code"),
                city=market.get("city"),
                state=market.get("state"),
                property_type=market.get("property_type"),
            ),
        }

    @classmethod
    def _store_path(cls) -> Path:
        root = Path(__file__).resolve().parents[2]
        instance_dir = root / "instance"
        instance_dir.mkdir(parents=True, exist_ok=True)
        return instance_dir / "avm_calibration.json"

    @classmethod
    def _read_store(cls) -> Dict[str, Any]:
        with cls._lock:
            if cls._cache is not None:
                return deepcopy(cls._cache)

            path = cls._store_path()
            if not path.exists():
                cls._cache = {"markets": {}}
                return deepcopy(cls._cache)

            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(raw, dict):
                    raw = {"markets": {}}
            except Exception:
                raw = {"markets": {}}

            if "markets" not in raw or not isinstance(raw["markets"], dict):
                raw["markets"] = {}

            cls._cache = raw
            return deepcopy(cls._cache)

    @classmethod
    def _write_store(cls, payload: Dict[str, Any]) -> None:
        with cls._lock:
            path = cls._store_path()
            path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
            cls._cache = deepcopy(payload)

    @classmethod
    def _deep_merge(cls, base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
        out = deepcopy(base)
        for key, value in (override or {}).items():
            if isinstance(value, dict) and isinstance(out.get(key), dict):
                out[key] = cls._deep_merge(out[key], value)
            else:
                out[key] = value
        return out
