from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any

from backend.extensions import db
from backend.models import Contact
from backend.services.activity_service import ActivityService


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_items(values: Any, default_label: str = "main") -> list[dict[str, str]]:
    if not values:
        return []

    items: list[dict[str, str]] = []
    if isinstance(values, str):
        values = [values]

    for value in values:
        if isinstance(value, str):
            cleaned = _clean_text(value)
            if cleaned:
                items.append({"label": default_label, "value": cleaned})
            continue

        if not isinstance(value, dict):
            continue

        item = {"label": _clean_text(value.get("label")) or default_label}
        for field in ("value", "street", "city", "state", "postal_code", "country", "formatted", "type"):
            cleaned = _clean_text(value.get(field))
            if cleaned:
                item[field] = cleaned
        if any(key in item for key in ("value", "street", "formatted")):
            items.append(item)

    return items


def _normalize_groups(values: Any) -> str:
    if not values:
        return ""
    if isinstance(values, str):
        parts = values.split(",")
    else:
        parts = list(values)
    cleaned = [_clean_text(part) for part in parts if _clean_text(part)]
    return ",".join(dict.fromkeys(cleaned))


def _parse_date(value: Any):
    text = _clean_text(value)
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _display_name(contact: Contact) -> str:
    pieces = [contact.prefix, contact.first_name, contact.middle_name, contact.last_name, contact.suffix]
    name = " ".join([piece for piece in pieces if _clean_text(piece)]).strip()
    if name:
        return name
    if _clean_text(contact.nickname):
        return contact.nickname.strip()
    if _clean_text(contact.company):
        return contact.company.strip()
    return "Unnamed Contact"


def _primary_value(items: list[dict[str, str]], key: str = "value") -> str | None:
    for item in items:
        value = _clean_text(item.get(key))
        if value:
            return value
    return None


def _initials(name: str) -> str:
    letters = [part[0] for part in name.split() if part]
    return ("".join(letters[:2]) or "?").upper()


def _serialize(contact: Contact) -> dict:
    display_name = _display_name(contact)
    return {
        "id": contact.id,
        "display_name": display_name,
        "initials": _initials(display_name),
        "prefix": contact.prefix,
        "first_name": contact.first_name,
        "middle_name": contact.middle_name,
        "last_name": contact.last_name,
        "suffix": contact.suffix,
        "nickname": contact.nickname,
        "company": contact.company,
        "job_title": contact.job_title,
        "department": contact.department,
        "photo_url": contact.photo_url,
        "linked_contact_ids": contact.linked_contact_ids or [],
        "phones": contact.phones or [],
        "emails": contact.emails or [],
        "addresses": contact.addresses or [],
        "urls": contact.urls or [],
        "social_profiles": contact.social_profiles or [],
        "birthday": contact.birthday.isoformat() if contact.birthday else None,
        "anniversary": contact.anniversary.isoformat() if contact.anniversary else None,
        "notes": contact.notes,
        "groups": [group.strip() for group in (contact.groups or "").split(",") if group.strip()],
        "is_favorite": contact.is_favorite,
        "is_archived": contact.is_archived,
        "source": contact.source,
        "primary_phone": _primary_value(contact.phones or []),
        "primary_email": _primary_value(contact.emails or []),
        "primary_address": _primary_value(contact.addresses or [], key="formatted") or _primary_value(contact.addresses or []),
        "created_at": contact.created_at.isoformat() if contact.created_at else None,
        "updated_at": contact.updated_at.isoformat() if contact.updated_at else None,
    }


def _normalize_payload(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "prefix": _clean_text(data.get("prefix")) or None,
        "first_name": _clean_text(data.get("first_name")) or None,
        "middle_name": _clean_text(data.get("middle_name")) or None,
        "last_name": _clean_text(data.get("last_name")) or None,
        "suffix": _clean_text(data.get("suffix")) or None,
        "nickname": _clean_text(data.get("nickname")) or None,
        "company": _clean_text(data.get("company")) or None,
        "job_title": _clean_text(data.get("job_title")) or None,
        "department": _clean_text(data.get("department")) or None,
        "photo_url": _clean_text(data.get("photo_url")) or None,
        "linked_contact_ids": [str(item).strip() for item in (data.get("linked_contact_ids") or []) if str(item).strip()],
        "phones": _normalize_items(data.get("phones")),
        "emails": _normalize_items(data.get("emails")),
        "addresses": _normalize_items(data.get("addresses"), default_label="home"),
        "urls": _normalize_items(data.get("urls")),
        "social_profiles": _normalize_items(data.get("social_profiles"), default_label="profile"),
        "birthday": _parse_date(data.get("birthday")),
        "anniversary": _parse_date(data.get("anniversary")),
        "notes": _clean_text(data.get("notes")) or None,
        "groups": _normalize_groups(data.get("groups")),
        "is_favorite": bool(data.get("is_favorite", False)),
        "source": _clean_text(data.get("source")) or "manual",
    }


def _merge_items(primary: list[dict[str, str]], secondary: list[dict[str, str]]) -> list[dict[str, str]]:
    seen = set()
    merged: list[dict[str, str]] = []
    for item in [*primary, *secondary]:
        key = tuple(sorted((k, _clean_text(v)) for k, v in item.items()))
        if key in seen:
            continue
        seen.add(key)
        merged.append(item)
    return merged


def _merge_contact_values(primary: Contact, duplicate: Contact) -> None:
    for field in ("prefix", "first_name", "middle_name", "last_name", "suffix", "nickname", "company", "job_title", "department", "birthday", "anniversary", "photo_url"):
        if getattr(primary, field) in (None, "") and getattr(duplicate, field) not in (None, ""):
            setattr(primary, field, getattr(duplicate, field))

    primary.phones = _merge_items(primary.phones or [], duplicate.phones or [])
    primary.emails = _merge_items(primary.emails or [], duplicate.emails or [])
    primary.addresses = _merge_items(primary.addresses or [], duplicate.addresses or [])
    primary.urls = _merge_items(primary.urls or [], duplicate.urls or [])
    primary.social_profiles = _merge_items(primary.social_profiles or [], duplicate.social_profiles or [])

    notes = [text for text in [primary.notes, duplicate.notes] if _clean_text(text)]
    if notes:
        primary.notes = "\n\n".join(dict.fromkeys(notes))

    group_values = [group.strip() for group in (primary.groups or "").split(",") if group.strip()]
    group_values.extend([group.strip() for group in (duplicate.groups or "").split(",") if group.strip()])
    primary.groups = ",".join(dict.fromkeys(group_values))
    primary.linked_contact_ids = list(dict.fromkeys([*(primary.linked_contact_ids or []), duplicate.id, *(duplicate.linked_contact_ids or [])]))
    primary.is_favorite = primary.is_favorite or duplicate.is_favorite


def _candidate_keys(contact: Contact) -> set[str]:
    keys: set[str] = set()
    display_name = _display_name(contact).lower()
    if display_name:
        keys.add(f"name::{display_name}")
    if _clean_text(contact.company):
        keys.add(f"company::{contact.company.strip().lower()}")

    for item in contact.emails or []:
        value = _clean_text(item.get("value")).lower()
        if value:
            keys.add(f"email::{value}")
    for item in contact.phones or []:
        value = _clean_text(item.get("value"))
        if value:
            keys.add(f"phone::{value}")
    return keys


def _unfold_vcard(text: str) -> list[str]:
    lines: list[str] = []
    for raw_line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw_line.startswith((" ", "\t")) and lines:
            lines[-1] += raw_line[1:]
        else:
            lines.append(raw_line)
    return lines


def _parse_vcard_blocks(text: str) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for line in _unfold_vcard(text):
        if not line:
            continue
        upper = line.upper()
        if upper == "BEGIN:VCARD":
            current = defaultdict(list)
            continue
        if upper == "END:VCARD":
            if current:
                cards.append(dict(current))
            current = None
            continue
        if current is None or ":" not in line:
            continue
        field, value = line.split(":", 1)
        field_name = field.split(";", 1)[0].upper()
        current[field_name].append(value)
    return cards


def _vcard_value(values: list[str] | None) -> str | None:
    if not values:
        return None
    for value in values:
        cleaned = _clean_text(value)
        if cleaned:
            return cleaned
    return None


def _parse_vcard_contact(card: dict[str, list[str]]) -> dict[str, Any]:
    n_parts = (_vcard_value(card.get("N")) or "").split(";")
    fn = _vcard_value(card.get("FN")) or ""
    contact = {
        "prefix": n_parts[3] if len(n_parts) > 3 else None,
        "first_name": n_parts[1] if len(n_parts) > 1 else None,
        "middle_name": n_parts[2] if len(n_parts) > 2 else None,
        "last_name": n_parts[0] if n_parts and n_parts[0] else None,
        "suffix": n_parts[4] if len(n_parts) > 4 else None,
        "nickname": _vcard_value(card.get("NICKNAME")),
        "company": None,
        "job_title": _vcard_value(card.get("TITLE")),
        "department": None,
        "photo_url": _vcard_value(card.get("PHOTO")),
        "linked_contact_ids": [],
        "phones": [{"label": "main", "value": value} for value in (card.get("TEL") or []) if _clean_text(value)],
        "emails": [{"label": "main", "value": value} for value in (card.get("EMAIL") or []) if _clean_text(value)],
        "addresses": [],
        "urls": [{"label": "link", "value": value} for value in (card.get("URL") or []) if _clean_text(value)],
        "social_profiles": [],
        "birthday": _vcard_value(card.get("BDAY")),
        "notes": _vcard_value(card.get("NOTE")),
        "groups": _vcard_value(card.get("CATEGORIES")) or "",
        "is_favorite": False,
        "source": "vcard_import",
    }

    org = _vcard_value(card.get("ORG"))
    if org:
        org_parts = [part.strip() for part in org.split(";") if part.strip()]
        contact["company"] = org_parts[0] if org_parts else None
        if len(org_parts) > 1:
            contact["department"] = org_parts[1]

    if fn and not contact["first_name"] and not contact["last_name"]:
        if " " in fn:
            contact["first_name"], contact["last_name"] = fn.split(" ", 1)
        else:
            contact["first_name"] = fn

    for adr in card.get("ADR") or []:
        parts = [part.strip() for part in adr.split(";")]
        if len(parts) >= 7:
            contact["addresses"].append(
                {
                    "label": "home",
                    "street": " ".join([segment for segment in [parts[2], parts[3]] if segment]).strip(),
                    "city": parts[3] or "",
                    "state": parts[4] or "",
                    "postal_code": parts[5] or "",
                    "country": parts[6] or "",
                    "formatted": ", ".join([segment for segment in [parts[2], parts[3], parts[4], parts[5], parts[6]] if segment]),
                }
            )

    if contact["birthday"]:
        contact["birthday"] = _parse_date(contact["birthday"])

    if fn and not contact["first_name"] and not contact["last_name"]:
        contact["nickname"] = fn

    if not contact["first_name"] and not contact["last_name"] and not contact["nickname"]:
        contact["first_name"] = "Imported Contact"

    return contact


def _serialize_vcard(contact: Contact) -> str:
    display_name = _display_name(contact)
    n_value = ";".join([
        contact.last_name or "",
        contact.first_name or "",
        contact.middle_name or "",
        contact.prefix or "",
        contact.suffix or "",
    ])

    lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        f"FN:{display_name}",
        f"N:{n_value}",
    ]

    if contact.company:
        org_value = contact.company if not contact.department else f"{contact.company};{contact.department}"
        lines.append(f"ORG:{org_value}")
    if contact.photo_url:
        lines.append(f"PHOTO;VALUE=URI:{contact.photo_url}")
    if contact.job_title:
        lines.append(f"TITLE:{contact.job_title}")
    if contact.nickname:
        lines.append(f"NICKNAME:{contact.nickname}")
    if contact.birthday:
        lines.append(f"BDAY:{contact.birthday.isoformat()}")
    if contact.groups:
        lines.append(f"CATEGORIES:{contact.groups}")
    for item in contact.phones or []:
        value = _clean_text(item.get("value"))
        if value:
            lines.append(f"TEL;TYPE={_clean_text(item.get('label')) or 'VOICE'}:{value}")
    for item in contact.emails or []:
        value = _clean_text(item.get("value"))
        if value:
            lines.append(f"EMAIL;TYPE={_clean_text(item.get('label')) or 'INTERNET'}:{value}")
    for item in contact.addresses or []:
        formatted = _clean_text(item.get("formatted"))
        street = _clean_text(item.get("street"))
        city = _clean_text(item.get("city"))
        state = _clean_text(item.get("state"))
        postal_code = _clean_text(item.get("postal_code"))
        country = _clean_text(item.get("country"))
        lines.append(f"ADR;TYPE={_clean_text(item.get('label')) or 'HOME'}:;;{street};{city};{state};{postal_code};{country}")
        if formatted:
            lines.append(f"NOTE:{formatted}" if not contact.notes else f"NOTE:{contact.notes}\n{formatted}")
    for item in contact.urls or []:
        value = _clean_text(item.get("value"))
        if value:
            lines.append(f"URL:{value}")
    if contact.notes:
        lines.append(f"NOTE:{contact.notes}")
    lines.append("END:VCARD")
    return "\r\n".join(lines)


class ContactService:
    @staticmethod
    def list(user_id: str, query: str = "", favorite: bool | None = None, group: str = "", limit: int = 500) -> dict:
        rows = Contact.query.filter_by(user_id=user_id, is_archived=False).all()
        items = [_serialize(row) for row in rows]

        search = _clean_text(query).lower()
        group_filter = _clean_text(group).lower()
        if search:
            items = [
                item
                for item in items
                if search in " ".join(
                    [
                        item.get("display_name") or "",
                        item.get("company") or "",
                        item.get("job_title") or "",
                        item.get("department") or "",
                        item.get("notes") or "",
                        " ".join(item.get("groups") or []),
                        " ".join(phone.get("value", "") for phone in item.get("phones", [])),
                        " ".join(email.get("value", "") for email in item.get("emails", [])),
                    ]
                ).lower()
            ]

        if favorite is not None:
            items = [item for item in items if item.get("is_favorite") is favorite]

        if group_filter:
            items = [item for item in items if group_filter in [group_name.lower() for group_name in (item.get("groups") or [])]]

        items.sort(key=lambda item: (not item.get("is_favorite", False), (item.get("display_name") or "").lower()))
        items = items[: max(1, min(int(limit), 1000))]

        groups = sorted({group_name for item in items for group_name in (item.get("groups") or []) if group_name})
        return {"items": items, "groups": groups, "total": len(items)}

    @staticmethod
    def get(contact_id: str, user_id: str) -> dict:
        contact = Contact.query.filter_by(id=contact_id, user_id=user_id, is_archived=False).first_or_404()
        return _serialize(contact)

    @staticmethod
    def create(user_id: str, data: dict[str, Any]) -> dict:
        payload = _normalize_payload(data)
        contact = Contact(user_id=user_id, **payload)
        db.session.add(contact)
        db.session.commit()
        ActivityService.log(actor_id=user_id, message=f"Contact created: {_display_name(contact)}", level="info")
        return _serialize(contact)

    @staticmethod
    def update(contact_id: str, user_id: str, data: dict[str, Any]) -> dict:
        contact = Contact.query.filter_by(id=contact_id, user_id=user_id, is_archived=False).first_or_404()
        payload = _normalize_payload(data)
        for key, value in payload.items():
            setattr(contact, key, value)
        db.session.commit()
        ActivityService.log(actor_id=user_id, message=f"Contact updated: {_display_name(contact)}", level="info")
        return _serialize(contact)

    @staticmethod
    def delete(contact_id: str, user_id: str) -> None:
        contact = Contact.query.filter_by(id=contact_id, user_id=user_id, is_archived=False).first_or_404()
        contact.is_archived = True
        db.session.commit()
        ActivityService.log(actor_id=user_id, message=f"Contact archived: {_display_name(contact)}", level="info")

    @staticmethod
    def set_favorite(contact_id: str, user_id: str, is_favorite: bool) -> dict:
        contact = Contact.query.filter_by(id=contact_id, user_id=user_id, is_archived=False).first_or_404()
        contact.is_favorite = is_favorite
        db.session.commit()
        ActivityService.log(actor_id=user_id, message=f"Contact favorite updated: {_display_name(contact)}", level="info")
        return _serialize(contact)

    @staticmethod
    def merge_duplicates(user_id: str) -> dict:
        rows = Contact.query.filter_by(user_id=user_id, is_archived=False).all()
        buckets: dict[str, list[Contact]] = defaultdict(list)
        for row in rows:
            keys = _candidate_keys(row)
            if not keys:
                continue
            buckets[min(keys)].append(row)

        merged_groups = 0
        archived_count = 0
        for group in buckets.values():
            if len(group) < 2:
                continue
            primary = group[0]
            for duplicate in group[1:]:
                _merge_contact_values(primary, duplicate)
                duplicate.is_archived = True
                archived_count += 1
            merged_groups += 1

        db.session.commit()
        if merged_groups:
            ActivityService.log(actor_id=user_id, message=f"Contacts merged: {merged_groups} groups", level="info")
        return {"merged_groups": merged_groups, "archived_count": archived_count}

    @staticmethod
    def link_contacts(user_id: str, primary_contact_id: str, linked_contact_id: str) -> dict:
        primary = Contact.query.filter_by(id=primary_contact_id, user_id=user_id, is_archived=False).first_or_404()
        linked = Contact.query.filter_by(id=linked_contact_id, user_id=user_id, is_archived=False).first_or_404()
        primary.linked_contact_ids = list(dict.fromkeys([*(primary.linked_contact_ids or []), linked.id]))
        linked.linked_contact_ids = list(dict.fromkeys([*(linked.linked_contact_ids or []), primary.id]))
        db.session.commit()
        ActivityService.log(actor_id=user_id, message=f"Contacts linked: {_display_name(primary)} <-> {_display_name(linked)}", level="info")
        return _serialize(primary)

    @staticmethod
    def unlink_contact(user_id: str, primary_contact_id: str, linked_contact_id: str) -> dict:
        primary = Contact.query.filter_by(id=primary_contact_id, user_id=user_id, is_archived=False).first_or_404()
        linked = Contact.query.filter_by(id=linked_contact_id, user_id=user_id, is_archived=False).first_or_404()
        primary.linked_contact_ids = [item for item in (primary.linked_contact_ids or []) if item != linked.id]
        linked.linked_contact_ids = [item for item in (linked.linked_contact_ids or []) if item != primary.id]
        db.session.commit()
        ActivityService.log(actor_id=user_id, message=f"Contacts unlinked: {_display_name(primary)} <-> {_display_name(linked)}", level="info")
        return _serialize(primary)

    @staticmethod
    def export_vcard(user_id: str, contact_ids: list[str] | None = None) -> dict:
        query = Contact.query.filter_by(user_id=user_id, is_archived=False)
        if contact_ids:
            query = query.filter(Contact.id.in_(contact_ids))
        contacts = query.order_by(Contact.is_favorite.desc(), Contact.last_name.asc().nullslast(), Contact.first_name.asc().nullslast()).all()
        vcard = "\r\n".join(_serialize_vcard(contact) for contact in contacts)
        ActivityService.log(actor_id=user_id, message=f"Contacts export generated: {len(contacts)} cards", level="info")
        return {"vcard": vcard, "count": len(contacts)}

    @staticmethod
    def import_vcard(user_id: str, vcard_text: str, merge: bool = True) -> dict:
        cards = _parse_vcard_blocks(vcard_text)
        created = 0
        updated = 0
        skipped = 0

        for card in cards:
            payload = _parse_vcard_contact(card)
            if not _clean_text(payload.get("first_name")) and not _clean_text(payload.get("last_name")) and not _clean_text(payload.get("company")):
                skipped += 1
                continue

            existing = None
            if merge:
                candidates = Contact.query.filter_by(user_id=user_id, is_archived=False).all()
                payload_email = _primary_value(payload["emails"])
                payload_phone = _primary_value(payload["phones"])
                payload_name = f"{_clean_text(payload.get('first_name'))} {_clean_text(payload.get('last_name'))}".strip().lower()
                for candidate in candidates:
                    candidate_name = _display_name(candidate).lower()
                    if payload_email and any(_clean_text(item.get("value")).lower() == payload_email.lower() for item in candidate.emails or []):
                        existing = candidate
                        break
                    if payload_phone and any(_clean_text(item.get("value")) == payload_phone for item in candidate.phones or []):
                        existing = candidate
                        break
                    if payload_name and candidate_name == payload_name:
                        existing = candidate
                        break

            if existing:
                for key, value in payload.items():
                    if key in {"phones", "emails", "addresses", "urls", "social_profiles"}:
                        setattr(existing, key, _merge_items(getattr(existing, key) or [], value or []))
                    elif key == "notes" and value:
                        existing.notes = "\n\n".join([text for text in [existing.notes, value] if _clean_text(text)])
                    elif key == "groups" and value:
                        existing.groups = _normalize_groups([existing.groups or "", value])
                    elif key in {"birthday", "anniversary"}:
                        current = getattr(existing, key)
                        if current is None and value:
                            setattr(existing, key, _parse_date(value))
                    elif getattr(existing, key) in (None, "") and value not in (None, ""):
                        setattr(existing, key, value)
                updated += 1
            else:
                contact = Contact(user_id=user_id, **payload)
                db.session.add(contact)
                created += 1

        db.session.commit()
        ActivityService.log(actor_id=user_id, message=f"Contacts import complete: +{created} created / {updated} updated", level="info")
        return {"created": created, "updated": updated, "skipped": skipped, "received": len(cards)}
