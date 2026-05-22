from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode
from uuid import uuid4

import requests
from flask import current_app
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from backend.extensions import db
from backend.models import CalendarEvent, IntegrationAccount
from backend.services.activity_service import ActivityService
from backend.services.property_service import PropertyService
from backend.utils.security import decrypt_value, encrypt_value


class IntegrationService:
    @staticmethod
    def provider_status(user_id: str) -> dict:
        providers = current_app.config.get("OAUTH_PROVIDERS") or {}
        accounts = {
            row.provider: row
            for row in IntegrationAccount.query.filter_by(user_id=user_id).all()
        }

        status = {}
        for key in ("google", "microsoft", "ical", "zillow"):
            cfg = providers.get(key, {})
            account = accounts.get(key)
            status[key] = {
                "enabled": bool(cfg.get("enabled")),
                "connected": bool(account and account.status == "connected"),
                "provider_account_id": account.provider_account_id if account else None,
                "last_synced_at": account.last_synced_at.isoformat() if account and account.last_synced_at else None,
                "mode": cfg.get("mode"),
                "ics_url": ((account.settings or {}).get("ics_url") if account and key == "ical" else None),
            }

        return status

    @staticmethod
    def connect_url(provider: str, user_id: str) -> str:
        cfg = IntegrationService._provider_cfg(provider)
        if not cfg.get("enabled"):
            raise ValueError(f"{provider} integration is not configured")

        state = IntegrationService._state_serializer().dumps(
            {"uid": user_id, "provider": provider, "nonce": str(uuid4())}
        )

        if provider == "google":
            query = {
                "client_id": cfg["client_id"],
                "redirect_uri": cfg["redirect_uri"],
                "response_type": "code",
                "scope": " ".join(cfg.get("scopes") or []),
                "access_type": "offline",
                "prompt": "consent",
                "include_granted_scopes": "true",
                "state": state,
            }
            return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(query)}"

        if provider == "microsoft":
            tenant = cfg.get("tenant_id") or "common"
            query = {
                "client_id": cfg["client_id"],
                "redirect_uri": cfg["redirect_uri"],
                "response_type": "code",
                "response_mode": "query",
                "scope": " ".join(cfg.get("scopes") or []),
                "state": state,
                "prompt": "select_account",
            }
            return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?{urlencode(query)}"

        raise ValueError("unsupported provider")

    @staticmethod
    def handle_callback(provider: str, code: str, state: str) -> dict:
        if not code or not state:
            raise ValueError("missing OAuth callback payload")

        payload = IntegrationService._state_serializer().loads(state, max_age=1200)
        user_id = payload.get("uid")
        state_provider = payload.get("provider")

        if not user_id or state_provider != provider:
            raise ValueError("invalid OAuth state")

        if provider == "google":
            tokens = IntegrationService._google_exchange_code(code)
            profile = IntegrationService._google_profile(tokens.get("access_token", ""))
            account_id = profile.get("email") or profile.get("id")
            scopes = tokens.get("scope") or " ".join(IntegrationService._provider_cfg("google").get("scopes") or [])
            IntegrationService._store_tokens(
                user_id=user_id,
                provider="google",
                provider_account_id=account_id,
                access_token=tokens.get("access_token"),
                refresh_token=tokens.get("refresh_token"),
                expires_in=tokens.get("expires_in"),
                scopes=scopes,
                settings={"profile": profile},
            )
            return {"provider": "google", "user_id": user_id}

        if provider == "microsoft":
            tokens = IntegrationService._microsoft_exchange_code(code)
            profile = IntegrationService._microsoft_profile(tokens.get("access_token", ""))
            account_id = profile.get("userPrincipalName") or profile.get("id")
            scopes = tokens.get("scope") or " ".join(IntegrationService._provider_cfg("microsoft").get("scopes") or [])
            IntegrationService._store_tokens(
                user_id=user_id,
                provider="microsoft",
                provider_account_id=account_id,
                access_token=tokens.get("access_token"),
                refresh_token=tokens.get("refresh_token"),
                expires_in=tokens.get("expires_in"),
                scopes=scopes,
                settings={"profile": profile},
            )
            return {"provider": "microsoft", "user_id": user_id}

        raise ValueError("unsupported provider")

    @staticmethod
    def disconnect(user_id: str, provider: str) -> None:
        account = IntegrationAccount.query.filter_by(user_id=user_id, provider=provider).first()
        if not account:
            return
        account.status = "disconnected"
        account.access_token_enc = None
        account.refresh_token_enc = None
        account.token_expires_at = None
        db.session.commit()

    @staticmethod
    def sync_google(user_id: str) -> dict:
        account = IntegrationService._connected_account(user_id, "google")
        access_token = IntegrationService._ensure_access_token(account)

        items = []
        next_page = None
        while True:
            params = {
                "maxResults": 2500,
                "singleEvents": "true",
                "orderBy": "startTime",
            }
            if next_page:
                params["pageToken"] = next_page
            response = requests.get(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers={"Authorization": f"Bearer {access_token}"},
                params=params,
                timeout=20,
            )
            if not response.ok:
                raise ValueError(f"Google sync failed: {response.text[:240]}")
            payload = response.json()
            items.extend(payload.get("items") or [])
            next_page = payload.get("nextPageToken")
            if not next_page:
                break

        upserted = 0
        for item in items:
            event_id = item.get("id") or str(uuid4())
            start_dt, is_all_day = IntegrationService._google_datetime(item.get("start") or {})
            end_dt, _ = IntegrationService._google_datetime(item.get("end") or {})
            if not start_dt or not end_dt:
                continue
            IntegrationService._upsert_calendar_event(
                user_id=user_id,
                provider="google",
                provider_event_id=event_id,
                title=item.get("summary") or "Untitled event",
                description=item.get("description"),
                starts_at=start_dt,
                ends_at=end_dt,
                location=item.get("location"),
                status=item.get("status") or "confirmed",
                is_all_day=is_all_day,
                recurring_rule=(item.get("recurrence") or [None])[0],
            )
            upserted += 1

        account.last_synced_at = datetime.utcnow()
        db.session.commit()
        ActivityService.log(
            actor_id=user_id,
            level="info",
            message=f"Google Calendar synced ({upserted} events)",
            meta={"provider": "google", "events": upserted},
        )
        return {"provider": "google", "events": upserted}

    @staticmethod
    def sync_microsoft(user_id: str) -> dict:
        account = IntegrationService._connected_account(user_id, "microsoft")
        access_token = IntegrationService._ensure_access_token(account)

        items = []
        next_url = "https://graph.microsoft.com/v1.0/me/events?$top=250"
        loops = 0
        while next_url and loops < 10:
            loops += 1
            response = requests.get(
                next_url,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=20,
            )
            if not response.ok:
                raise ValueError(f"Outlook sync failed: {response.text[:240]}")
            payload = response.json()
            items.extend(payload.get("value") or [])
            next_url = payload.get("@odata.nextLink")

        upserted = 0
        for item in items:
            event_id = item.get("id") or str(uuid4())
            start_dt = IntegrationService._iso_to_utc_naive((item.get("start") or {}).get("dateTime"))
            end_dt = IntegrationService._iso_to_utc_naive((item.get("end") or {}).get("dateTime"))
            if not start_dt or not end_dt:
                continue
            IntegrationService._upsert_calendar_event(
                user_id=user_id,
                provider="microsoft",
                provider_event_id=event_id,
                title=item.get("subject") or "Untitled event",
                description=((item.get("body") or {}).get("content") or "")[:4000],
                starts_at=start_dt,
                ends_at=end_dt,
                location=((item.get("location") or {}).get("displayName")),
                status=item.get("showAs") or "confirmed",
                is_all_day=bool(item.get("isAllDay")),
                recurring_rule=None,
            )
            upserted += 1

        account.last_synced_at = datetime.utcnow()
        db.session.commit()
        ActivityService.log(
            actor_id=user_id,
            level="info",
            message=f"Outlook Calendar synced ({upserted} events)",
            meta={"provider": "microsoft", "events": upserted},
        )
        return {"provider": "microsoft", "events": upserted}

    @staticmethod
    def sync_ical_text(user_id: str, ics_text: str, source_name: str = "import") -> dict:
        if not str(ics_text or "").strip():
            raise ValueError("ics payload required")

        events = IntegrationService._parse_ics_events(ics_text)
        upserted = 0
        for event in events:
            start_dt = event.get("starts_at")
            end_dt = event.get("ends_at")
            if not start_dt or not end_dt:
                continue
            IntegrationService._upsert_calendar_event(
                user_id=user_id,
                provider="ical",
                provider_event_id=event.get("uid") or str(uuid4()),
                title=event.get("summary") or "Untitled event",
                description=event.get("description"),
                starts_at=start_dt,
                ends_at=end_dt,
                location=event.get("location"),
                status=event.get("status") or "confirmed",
                is_all_day=bool(event.get("is_all_day")),
                recurring_rule=event.get("rrule"),
            )
            upserted += 1

        account = IntegrationAccount.query.filter_by(user_id=user_id, provider="ical").first()
        if not account:
            account = IntegrationAccount(user_id=user_id, provider="ical", status="connected")
            db.session.add(account)
        account.settings = {**(account.settings or {}), "source": source_name}
        account.last_synced_at = datetime.utcnow()

        db.session.commit()
        ActivityService.log(
            actor_id=user_id,
            level="info",
            message=f"iCalendar synced ({upserted} events)",
            meta={"provider": "ical", "events": upserted, "source": source_name},
        )
        return {"provider": "ical", "events": upserted}

    @staticmethod
    def sync_ical_url(user_id: str, ics_url: str) -> dict:
        url = str(ics_url or "").strip()
        if not url:
            raise ValueError("ics_url required")
        response = requests.get(url, timeout=20)
        if not response.ok:
            raise ValueError("unable to fetch iCalendar URL")

        account = IntegrationAccount.query.filter_by(user_id=user_id, provider="ical").first()
        if not account:
            account = IntegrationAccount(user_id=user_id, provider="ical", status="connected")
            db.session.add(account)
        account.settings = {**(account.settings or {}), "ics_url": url}
        db.session.flush()

        return IntegrationService.sync_ical_text(user_id=user_id, ics_text=response.text, source_name="url")

    @staticmethod
    def sync_saved_ical_url(user_id: str) -> dict:
        account = IntegrationAccount.query.filter_by(user_id=user_id, provider="ical", status="connected").first()
        ics_url = (account.settings or {}).get("ics_url") if account else None
        if not ics_url:
            raise ValueError("No iCalendar URL configured")
        return IntegrationService.sync_ical_url(user_id=user_id, ics_url=ics_url)

    @staticmethod
    def zillow_search(location: str, status_type: str = "ForSale", limit: int = 20) -> dict:
        api_key = current_app.config.get("RAPIDAPI_KEY") or ""
        host = current_app.config.get("RAPIDAPI_HOST_ZILLOW") or "zillow-com1.p.rapidapi.com"
        if not api_key:
            raise ValueError("Zillow integration is not configured")

        query = str(location or "").strip()
        if not query:
            raise ValueError("location required")

        response = requests.get(
            f"https://{host}/propertyExtendedSearch",
            headers={"X-RapidAPI-Key": api_key, "X-RapidAPI-Host": host},
            params={
                "location": query,
                "status_type": status_type,
                "sort": "Newest",
            },
            timeout=20,
        )
        if not response.ok:
            raise ValueError(f"Zillow search failed: {response.text[:240]}")

        props = response.json().get("props") or []
        items = []
        for raw in props[: max(1, min(limit, 50))]:
            items.append(
                {
                    "zpid": raw.get("zpid"),
                    "address": raw.get("address"),
                    "city": raw.get("city"),
                    "state": raw.get("state") or raw.get("stateCode"),
                    "zip_code": raw.get("zipcode") or raw.get("zipCode"),
                    "price": raw.get("price") or raw.get("lastSoldPrice"),
                    "bedrooms": raw.get("bedrooms"),
                    "bathrooms": raw.get("bathrooms"),
                    "sqft": raw.get("livingArea"),
                    "detail_url": raw.get("detailUrl"),
                    "latitude": raw.get("latitude"),
                    "longitude": raw.get("longitude"),
                }
            )

        return {"location": query, "count": len(items), "items": items}

    @staticmethod
    def zillow_estimate(data: dict) -> dict:
        return PropertyService.estimate_value(data)

    @staticmethod
    def _provider_cfg(provider: str) -> dict:
        providers = current_app.config.get("OAUTH_PROVIDERS") or {}
        cfg = providers.get(provider) or {}
        return cfg

    @staticmethod
    def _state_serializer() -> URLSafeTimedSerializer:
        return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="vault.integrations.oauth")

    @staticmethod
    def _google_exchange_code(code: str) -> dict:
        cfg = IntegrationService._provider_cfg("google")
        response = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": cfg.get("client_id"),
                "client_secret": current_app.config.get("GOOGLE_CALENDAR_CLIENT_SECRET"),
                "redirect_uri": cfg.get("redirect_uri"),
                "grant_type": "authorization_code",
            },
            timeout=20,
        )
        if not response.ok:
            raise ValueError(f"Google token exchange failed: {response.text[:240]}")
        return response.json()

    @staticmethod
    def _microsoft_exchange_code(code: str) -> dict:
        cfg = IntegrationService._provider_cfg("microsoft")
        tenant = cfg.get("tenant_id") or "common"
        response = requests.post(
            f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
            data={
                "client_id": cfg.get("client_id"),
                "client_secret": current_app.config.get("MICROSOFT_CLIENT_SECRET"),
                "code": code,
                "redirect_uri": cfg.get("redirect_uri"),
                "grant_type": "authorization_code",
                "scope": " ".join(cfg.get("scopes") or []),
            },
            timeout=20,
        )
        if not response.ok:
            raise ValueError(f"Microsoft token exchange failed: {response.text[:240]}")
        return response.json()

    @staticmethod
    def _google_profile(access_token: str) -> dict:
        if not access_token:
            return {}
        response = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=20,
        )
        return response.json() if response.ok else {}

    @staticmethod
    def _microsoft_profile(access_token: str) -> dict:
        if not access_token:
            return {}
        response = requests.get(
            "https://graph.microsoft.com/v1.0/me?$select=id,userPrincipalName,mail,displayName",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=20,
        )
        return response.json() if response.ok else {}

    @staticmethod
    def _store_tokens(
        user_id: str,
        provider: str,
        provider_account_id: str | None,
        access_token: str | None,
        refresh_token: str | None,
        expires_in: Any,
        scopes: str | None,
        settings: dict | None = None,
    ) -> IntegrationAccount:
        account = IntegrationAccount.query.filter_by(user_id=user_id, provider=provider).first()
        if not account:
            account = IntegrationAccount(user_id=user_id, provider=provider)
            db.session.add(account)

        account.provider_account_id = provider_account_id
        if access_token:
            account.access_token_enc = encrypt_value(access_token)
        if refresh_token:
            account.refresh_token_enc = encrypt_value(refresh_token)
        account.scopes = scopes
        account.status = "connected"
        account.settings = settings or account.settings

        try:
            expires_seconds = int(expires_in or 0)
        except (TypeError, ValueError):
            expires_seconds = 0
        if expires_seconds > 0:
            account.token_expires_at = datetime.utcnow() + timedelta(seconds=max(0, expires_seconds - 30))

        db.session.commit()
        return account

    @staticmethod
    def _connected_account(user_id: str, provider: str) -> IntegrationAccount:
        account = IntegrationAccount.query.filter_by(user_id=user_id, provider=provider, status="connected").first()
        if not account:
            raise ValueError(f"{provider} is not connected")
        return account

    @staticmethod
    def _ensure_access_token(account: IntegrationAccount) -> str:
        provider = account.provider
        access_token = decrypt_value(account.access_token_enc or "")

        if account.token_expires_at and account.token_expires_at > datetime.utcnow() + timedelta(seconds=30):
            return access_token

        refresh_token = decrypt_value(account.refresh_token_enc or "")
        if not refresh_token:
            return access_token

        if provider == "google":
            cfg = IntegrationService._provider_cfg("google")
            response = requests.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": cfg.get("client_id"),
                    "client_secret": current_app.config.get("GOOGLE_CALENDAR_CLIENT_SECRET"),
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
                timeout=20,
            )
        elif provider == "microsoft":
            cfg = IntegrationService._provider_cfg("microsoft")
            tenant = cfg.get("tenant_id") or "common"
            response = requests.post(
                f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
                data={
                    "client_id": cfg.get("client_id"),
                    "client_secret": current_app.config.get("MICROSOFT_CLIENT_SECRET"),
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                    "scope": " ".join(cfg.get("scopes") or []),
                },
                timeout=20,
            )
        else:
            return access_token

        if not response.ok:
            return access_token

        data = response.json()
        new_access = data.get("access_token")
        if not new_access:
            return access_token

        account.access_token_enc = encrypt_value(new_access)
        try:
            expires_seconds = int(data.get("expires_in") or 0)
        except (TypeError, ValueError):
            expires_seconds = 0
        if expires_seconds > 0:
            account.token_expires_at = datetime.utcnow() + timedelta(seconds=max(0, expires_seconds - 30))

        db.session.commit()
        return new_access

    @staticmethod
    def _google_datetime(payload: dict) -> tuple[datetime | None, bool]:
        if "dateTime" in payload:
            return IntegrationService._iso_to_utc_naive(payload.get("dateTime")), False
        if "date" in payload:
            dt = IntegrationService._iso_to_utc_naive(f"{payload.get('date')}T00:00:00")
            return dt, True
        return None, False

    @staticmethod
    def _iso_to_utc_naive(value: str | None) -> datetime | None:
        text = str(value or "").strip()
        if not text:
            return None
        try:
            if text.endswith("Z"):
                parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
            else:
                parsed = datetime.fromisoformat(text)
        except ValueError:
            return None

        if parsed.tzinfo is None:
            return parsed
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)

    @staticmethod
    def _upsert_calendar_event(
        user_id: str,
        provider: str,
        provider_event_id: str,
        title: str,
        description: str | None,
        starts_at: datetime,
        ends_at: datetime,
        location: str | None,
        status: str,
        is_all_day: bool,
        recurring_rule: str | None,
    ) -> CalendarEvent:
        row = CalendarEvent.query.filter_by(
            user_id=user_id,
            provider=provider,
            provider_event_id=provider_event_id,
        ).first()
        if not row:
            row = CalendarEvent(
                user_id=user_id,
                provider=provider,
                provider_event_id=provider_event_id,
            )
            db.session.add(row)

        row.title = title
        row.description = description
        row.starts_at = starts_at
        row.ends_at = ends_at
        row.location = location
        row.status = status or "confirmed"
        row.is_all_day = bool(is_all_day)
        row.recurring_rule = recurring_rule
        return row

    @staticmethod
    def _parse_ics_events(ics_text: str) -> list[dict]:
        lines = []
        for raw in ics_text.splitlines():
            if raw.startswith((" ", "\t")) and lines:
                lines[-1] = f"{lines[-1]}{raw[1:]}"
            else:
                lines.append(raw.rstrip())

        events = []
        current = None
        for line in lines:
            if line == "BEGIN:VEVENT":
                current = {}
                continue
            if line == "END:VEVENT":
                if current:
                    events.append(IntegrationService._normalize_ics_event(current))
                current = None
                continue
            if current is None:
                continue
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.split(";", 1)[0].upper().strip()
            current[key] = value.strip()

        return [item for item in events if item.get("starts_at") and item.get("ends_at")]

    @staticmethod
    def _normalize_ics_event(raw: dict) -> dict:
        start_raw = raw.get("DTSTART")
        end_raw = raw.get("DTEND")
        start_dt, is_all_day = IntegrationService._parse_ics_dt(start_raw)
        end_dt, _ = IntegrationService._parse_ics_dt(end_raw)

        if start_dt and not end_dt:
            end_dt = start_dt + timedelta(hours=1)

        return {
            "uid": raw.get("UID") or str(uuid4()),
            "summary": raw.get("SUMMARY") or "Untitled event",
            "description": raw.get("DESCRIPTION"),
            "location": raw.get("LOCATION"),
            "status": raw.get("STATUS") or "confirmed",
            "rrule": raw.get("RRULE"),
            "starts_at": start_dt,
            "ends_at": end_dt,
            "is_all_day": is_all_day,
        }

    @staticmethod
    def _parse_ics_dt(value: str | None) -> tuple[datetime | None, bool]:
        text = str(value or "").strip()
        if not text:
            return None, False

        if len(text) == 8 and text.isdigit():
            try:
                return datetime.strptime(text, "%Y%m%d"), True
            except ValueError:
                return None, False

        if text.endswith("Z"):
            for fmt in ("%Y%m%dT%H%M%SZ", "%Y%m%dT%H%MZ"):
                try:
                    aware = datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
                    return aware.astimezone(timezone.utc).replace(tzinfo=None), False
                except ValueError:
                    continue
            return None, False

        for fmt in ("%Y%m%dT%H%M%S", "%Y%m%dT%H%M"):
            try:
                return datetime.strptime(text, fmt), False
            except ValueError:
                continue

        return None, False
