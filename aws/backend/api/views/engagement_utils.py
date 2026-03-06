from __future__ import annotations

import json
import re
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from django.db import connection


CHANNELS = {"email", "whatsapp"}

SEGMENT_DEFINITIONS = [
    {
        "key": "all_guests",
        "name": "All Reachable Guests",
        "description": "Every guest profile with a usable email or phone number.",
    },
    {
        "key": "vip_guests",
        "name": "VIP Guests",
        "description": "Guests flagged as VIP by the property team.",
    },
    {
        "key": "upcoming_arrivals",
        "name": "Upcoming Arrivals",
        "description": "Guests with an arrival in the next 30 days.",
    },
    {
        "key": "returning_guests",
        "name": "Returning Guests",
        "description": "Guests with two or more recorded stays.",
    },
    {
        "key": "lapsed_guests",
        "name": "Lapsed Guests",
        "description": "Past guests who have not stayed in the last 90 days.",
    },
    {
        "key": "opted_in_contacts",
        "name": "Marketing Contacts",
        "description": "Manual contacts captured for promotional outreach.",
    },
]

STARTER_TEMPLATES = [
    {
        "name": "Pre-arrival email",
        "channel": "email",
        "subject": "Your stay at {{property_name}} starts soon",
        "content": (
            "Hi {{guest_name}},\n\n"
            "We are looking forward to welcoming you to {{property_name}}. "
            "If you need airport transfer, early check-in, or local recommendations, reply to this email and our team will help.\n\n"
            "Regards,\n{{property_name}}"
        ),
        "variables": ["guest_name", "property_name", "next_check_in"],
    },
    {
        "name": "WhatsApp check-in reminder",
        "channel": "whatsapp",
        "subject": "",
        "content": (
            "Hi {{guest_name}}, this is {{property_name}}. "
            "Your stay is coming up on {{next_check_in}}. "
            "Reply here if you need directions or an arrival-time update."
        ),
        "variables": ["guest_name", "property_name", "next_check_in"],
    },
    {
        "name": "Win-back offer",
        "channel": "email",
        "subject": "A return-stay offer from {{property_name}}",
        "content": (
            "Hi {{guest_name}},\n\n"
            "It has been a while since your last stay with {{property_name}}. "
            "We would love to host you again. Reach out to unlock a returning-guest rate for your next visit.\n\n"
            "Regards,\n{{property_name}}"
        ),
        "variables": ["guest_name", "property_name", "last_checkout"],
    },
]


def _serialize(row: Any, columns: list[str]) -> dict[str, Any]:
    obj = dict(zip(columns, row))
    for key, value in obj.items():
        if isinstance(value, uuid.UUID):
            obj[key] = str(value)
        elif isinstance(value, Decimal):
            obj[key] = float(value)
        elif hasattr(value, "isoformat"):
            obj[key] = value.isoformat()
    return obj


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _safe_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def _coerce_json(value: Any, default: Any):
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed
        except json.JSONDecodeError:
            return default
    return default


def _safe_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        try:
            parsed = json.loads(stripped)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
        return [item.strip() for item in re.split(r"[\n,]", stripped) if item.strip()]
    return []


def normalize_channel(value: Any) -> str:
    channel = str(value or "email").strip().lower()
    return channel if channel in CHANNELS else "email"


def get_tenant_profile(tenant_id: str) -> dict[str, Any]:
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, slug, currency, timezone, contact_email, contact_phone
            FROM tenants
            WHERE id = %s
            """,
            [tenant_id],
        )
        row = cur.fetchone()
        if not row:
            return {
                "id": tenant_id,
                "name": "AIR BEE Property",
                "slug": None,
                "currency": "INR",
                "timezone": "Asia/Kolkata",
                "contact_email": None,
                "contact_phone": None,
            }
        return _serialize(row, [c[0] for c in cur.description])


def ensure_default_message_templates(tenant_id: str) -> None:
    with connection.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM message_templates WHERE tenant_id = %s", [tenant_id])
        count = _safe_int(cur.fetchone()[0], 0)
        if count > 0:
            return
        for template in STARTER_TEMPLATES:
            cur.execute(
                """
                INSERT INTO message_templates (
                    id, tenant_id, name, channel, subject, content, variables, is_active
                ) VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, true)
                """,
                [
                    str(uuid.uuid4()),
                    tenant_id,
                    template["name"],
                    template["channel"],
                    template["subject"] or None,
                    template["content"],
                    json.dumps(template.get("variables", [])),
                ],
            )


def get_message_templates(tenant_id: str) -> list[dict[str, Any]]:
    ensure_default_message_templates(tenant_id)
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT id, tenant_id, name, channel, subject, content, variables, is_active, created_at, updated_at
            FROM message_templates
            WHERE tenant_id = %s
            ORDER BY updated_at DESC, created_at DESC
            """,
            [tenant_id],
        )
        cols = [c[0] for c in cur.description]
        rows = [_serialize(row, cols) for row in cur.fetchall()]
    for row in rows:
        row["variables"] = _safe_list(row.get("variables"))
    return rows


def get_message_template_by_id(tenant_id: str, template_id: str) -> dict[str, Any] | None:
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT id, tenant_id, name, channel, subject, content, variables, is_active, created_at, updated_at
            FROM message_templates
            WHERE tenant_id = %s AND id = %s
            """,
            [tenant_id, template_id],
        )
        row = cur.fetchone()
        if not row:
            return None
        template = _serialize(row, [c[0] for c in cur.description])
        template["variables"] = _safe_list(template.get("variables"))
        return template


def get_message_logs(tenant_id: str, limit: int = 100) -> list[dict[str, Any]]:
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT id, tenant_id, campaign_id, template_id, channel, source,
                   recipient_name, recipient_email, recipient_phone,
                   subject, content, status, metadata, created_at
            FROM message_logs
            WHERE tenant_id = %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            [tenant_id, limit],
        )
        cols = [c[0] for c in cur.description]
        rows = [_serialize(row, cols) for row in cur.fetchall()]
    for row in rows:
        row["metadata"] = _coerce_json(row.get("metadata"), {})
    return rows


def get_marketing_contacts(tenant_id: str, limit: int | None = None) -> list[dict[str, Any]]:
    query = """
        SELECT id, tenant_id, name, email, phone, source, email_opt_in, whatsapp_opt_in, created_at
        FROM marketing_contacts
        WHERE tenant_id = %s
        ORDER BY created_at DESC
    """
    params: list[Any] = [tenant_id]
    if limit is not None:
        query += " LIMIT %s"
        params.append(limit)
    with connection.cursor() as cur:
        cur.execute(query, params)
        cols = [c[0] for c in cur.description]
        return [_serialize(row, cols) for row in cur.fetchall()]


def get_guest_audience(tenant_id: str) -> list[dict[str, Any]]:
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT gp.id, gp.tenant_id, gp.name, gp.email, gp.phone, gp.tags, gp.is_vip, gp.notes,
                   COUNT(DISTINCT b.id) FILTER (WHERE b.status <> 'cancelled') AS booking_count,
                   MAX(b.check_out) FILTER (WHERE b.status IN ('pending', 'confirmed', 'completed')) AS last_checkout,
                   MIN(b.check_in) FILTER (
                       WHERE b.status IN ('pending', 'confirmed') AND b.check_in >= CURRENT_DATE
                   ) AS next_check_in
            FROM guest_profiles gp
            LEFT JOIN bookings b
              ON b.tenant_id = gp.tenant_id
             AND (
                  b.guest_id = gp.id
                  OR (
                      gp.email IS NOT NULL AND b.guest_email IS NOT NULL
                      AND lower(b.guest_email) = lower(gp.email)
                  )
                  OR (
                      gp.phone IS NOT NULL AND b.guest_phone IS NOT NULL
                      AND b.guest_phone = gp.phone
                  )
             )
            WHERE gp.tenant_id = %s
            GROUP BY gp.id, gp.tenant_id, gp.name, gp.email, gp.phone, gp.tags, gp.is_vip, gp.notes, gp.created_at
            ORDER BY gp.name ASC
            """,
            [tenant_id],
        )
        cols = [c[0] for c in cur.description]
        rows = [_serialize(row, cols) for row in cur.fetchall()]
    for row in rows:
        row["tags"] = _safe_list(row.get("tags"))
        row["booking_count"] = _safe_int(row.get("booking_count"), 0)
    return rows


def _guest_to_recipient(guest: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": "guest_profiles",
        "source_id": guest.get("id"),
        "name": guest.get("name") or "Guest",
        "email": guest.get("email"),
        "phone": guest.get("phone"),
        "is_vip": _safe_bool(guest.get("is_vip")),
        "booking_count": _safe_int(guest.get("booking_count"), 0),
        "next_check_in": guest.get("next_check_in"),
        "last_checkout": guest.get("last_checkout"),
        "tags": guest.get("tags") or [],
    }


def _contact_to_recipient(contact: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": "marketing_contacts",
        "source_id": contact.get("id"),
        "name": contact.get("name") or "Contact",
        "email": contact.get("email"),
        "phone": contact.get("phone"),
        "email_opt_in": _safe_bool(contact.get("email_opt_in")),
        "whatsapp_opt_in": _safe_bool(contact.get("whatsapp_opt_in")),
    }


def _recipient_key(recipient: dict[str, Any]) -> str:
    email = (recipient.get("email") or "").strip().lower()
    phone = (recipient.get("phone") or "").strip()
    source = recipient.get("source_id") or recipient.get("name") or "manual"
    return email or phone or str(source)


def _supports_channel(recipient: dict[str, Any], channel: str) -> bool:
    if channel == "whatsapp":
        return bool((recipient.get("phone") or "").strip())
    return bool((recipient.get("email") or "").strip())


def _parse_iso_date(raw_value: Any) -> date | None:
    if not raw_value:
        return None
    if isinstance(raw_value, date) and not isinstance(raw_value, datetime):
        return raw_value
    if isinstance(raw_value, datetime):
        return raw_value.date()
    try:
        return datetime.fromisoformat(str(raw_value).replace("Z", "+00:00")).date()
    except Exception:
        return None


def build_segments(tenant_id: str) -> list[dict[str, Any]]:
    guests = get_guest_audience(tenant_id)
    contacts = get_marketing_contacts(tenant_id)
    today = date.today()
    in_30_days = today + timedelta(days=30)
    ninety_days_ago = today - timedelta(days=90)

    segment_recipients = {
        "all_guests": [_guest_to_recipient(guest) for guest in guests],
        "vip_guests": [_guest_to_recipient(guest) for guest in guests if _safe_bool(guest.get("is_vip"))],
        "upcoming_arrivals": [
            _guest_to_recipient(guest)
            for guest in guests
            if (next_check_in := _parse_iso_date(guest.get("next_check_in"))) and today <= next_check_in <= in_30_days
        ],
        "returning_guests": [
            _guest_to_recipient(guest)
            for guest in guests
            if _safe_int(guest.get("booking_count"), 0) >= 2
        ],
        "lapsed_guests": [
            _guest_to_recipient(guest)
            for guest in guests
            if (last_checkout := _parse_iso_date(guest.get("last_checkout")))
            and last_checkout < ninety_days_ago
            and not _parse_iso_date(guest.get("next_check_in"))
        ],
        "opted_in_contacts": [
            _contact_to_recipient(contact)
            for contact in contacts
            if _safe_bool(contact.get("email_opt_in")) or _safe_bool(contact.get("whatsapp_opt_in"))
        ],
    }

    segments: list[dict[str, Any]] = []
    for definition in SEGMENT_DEFINITIONS:
        recipients = segment_recipients.get(definition["key"], [])
        deduped: dict[str, dict[str, Any]] = {}
        for recipient in recipients:
            deduped[_recipient_key(recipient)] = recipient
        deduped_list = list(deduped.values())
        segments.append(
            {
                **definition,
                "count": len(deduped_list),
                "email_count": sum(1 for recipient in deduped_list if _supports_channel(recipient, "email")),
                "whatsapp_count": sum(1 for recipient in deduped_list if _supports_channel(recipient, "whatsapp")),
                "sample": [recipient.get("name") for recipient in deduped_list[:4] if recipient.get("name")],
            }
        )
    return segments


def resolve_recipients(
    tenant_id: str,
    channel: str,
    *,
    segment_key: str | None = None,
    manual_recipients: Any = None,
    guest_ids: list[str] | None = None,
    contact_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    guests = {guest["id"]: _guest_to_recipient(guest) for guest in get_guest_audience(tenant_id)}
    contacts = {contact["id"]: _contact_to_recipient(contact) for contact in get_marketing_contacts(tenant_id)}
    recipients: list[dict[str, Any]] = []

    if segment_key:
        segment_map = {segment["key"]: segment for segment in build_segments(tenant_id)}
        if segment_key not in segment_map:
            raise ValueError("Unknown segment")
        if segment_key == "opted_in_contacts":
            recipients.extend(
                recipient
                for recipient in contacts.values()
                if (_safe_bool(recipient.get("email_opt_in")) or _safe_bool(recipient.get("whatsapp_opt_in")))
            )
        else:
            for guest in guests.values():
                next_check_in = _parse_iso_date(guest.get("next_check_in"))
                last_checkout = _parse_iso_date(guest.get("last_checkout"))
                if segment_key == "all_guests":
                    recipients.append(guest)
                elif segment_key == "vip_guests" and _safe_bool(guest.get("is_vip")):
                    recipients.append(guest)
                elif segment_key == "upcoming_arrivals" and next_check_in and date.today() <= next_check_in <= date.today() + timedelta(days=30):
                    recipients.append(guest)
                elif segment_key == "returning_guests" and _safe_int(guest.get("booking_count"), 0) >= 2:
                    recipients.append(guest)
                elif segment_key == "lapsed_guests" and last_checkout and last_checkout < date.today() - timedelta(days=90) and not next_check_in:
                    recipients.append(guest)

    for guest_id in guest_ids or []:
        if guest_id in guests:
            recipients.append(guests[guest_id])

    for contact_id in contact_ids or []:
        if contact_id in contacts:
            recipients.append(contacts[contact_id])

    for token in _safe_list(manual_recipients):
        value = str(token).strip()
        if not value:
            continue
        recipient = {
            "source": "manual",
            "source_id": value,
            "name": value,
            "email": value if "@" in value else None,
            "phone": value if "@" not in value else None,
        }
        recipients.append(recipient)

    deduped: dict[str, dict[str, Any]] = {}
    for recipient in recipients:
        if _supports_channel(recipient, channel):
            deduped[_recipient_key(recipient)] = recipient
    return list(deduped.values())


def render_with_variables(template_text: str | None, recipient: dict[str, Any], tenant: dict[str, Any]) -> str | None:
    if template_text is None:
        return None
    replacements = {
        "guest_name": recipient.get("name") or "Guest",
        "property_name": tenant.get("name") or "AIR BEE Property",
        "property_slug": tenant.get("slug") or "",
        "contact_email": tenant.get("contact_email") or "",
        "contact_phone": tenant.get("contact_phone") or "",
        "next_check_in": recipient.get("next_check_in") or "soon",
        "last_checkout": recipient.get("last_checkout") or "your last stay",
    }
    rendered = template_text
    for key, value in replacements.items():
        rendered = rendered.replace(f"{{{{{key}}}}}", str(value))
    return rendered


def create_message_logs(
    tenant_id: str,
    *,
    channel: str,
    source: str,
    recipients: list[dict[str, Any]],
    subject_template: str | None,
    content_template: str,
    template_id: str | None = None,
    campaign_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    status: str = "logged",
) -> list[dict[str, Any]]:
    tenant = get_tenant_profile(tenant_id)
    metadata = metadata or {}
    created: list[dict[str, Any]] = []
    with connection.cursor() as cur:
        for recipient in recipients:
            subject = render_with_variables(subject_template, recipient, tenant)
            content = render_with_variables(content_template, recipient, tenant) or ""
            cur.execute(
                """
                INSERT INTO message_logs (
                    id, tenant_id, campaign_id, template_id, channel, source,
                    recipient_name, recipient_email, recipient_phone,
                    subject, content, status, metadata
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s::jsonb
                )
                RETURNING id, tenant_id, campaign_id, template_id, channel, source,
                          recipient_name, recipient_email, recipient_phone,
                          subject, content, status, metadata, created_at
                """,
                [
                    str(uuid.uuid4()),
                    tenant_id,
                    campaign_id,
                    template_id,
                    channel,
                    source,
                    recipient.get("name"),
                    recipient.get("email"),
                    recipient.get("phone"),
                    subject,
                    content,
                    status,
                    json.dumps(metadata),
                ],
            )
            created.append(_serialize(cur.fetchone(), [c[0] for c in cur.description]))
    for row in created:
        row["metadata"] = _coerce_json(row.get("metadata"), {})
    return created


def get_campaigns(tenant_id: str, limit: int = 50) -> list[dict[str, Any]]:
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT c.id, c.tenant_id, c.name, c.description, c.channel, c.status,
                   c.subject, c.content, c.template, c.segment_id,
                   c.scheduled_at, c.sent_at, c.created_at,
                   COUNT(ml.id) AS logged_messages,
                   COUNT(ml.id) FILTER (WHERE ml.status = 'logged') AS delivered_messages,
                   COUNT(ml.id) FILTER (WHERE ml.status = 'failed') AS failed_messages
            FROM campaigns c
            LEFT JOIN message_logs ml ON ml.campaign_id = c.id
            WHERE c.tenant_id = %s
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT %s
            """,
            [tenant_id, limit],
        )
        cols = [c[0] for c in cur.description]
        rows = [_serialize(row, cols) for row in cur.fetchall()]
    for row in rows:
        row["template"] = _coerce_json(row.get("template"), {})
        row["logged_messages"] = _safe_int(row.get("logged_messages"), 0)
        row["delivered_messages"] = _safe_int(row.get("delivered_messages"), 0)
        row["failed_messages"] = _safe_int(row.get("failed_messages"), 0)
    return rows
