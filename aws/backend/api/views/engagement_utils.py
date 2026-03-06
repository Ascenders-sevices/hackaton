from __future__ import annotations

import json
import re
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from django.db import connection


CHANNELS = {"email", "whatsapp"}
SEGMENT_SOURCES = {"guest_profiles", "marketing_contacts"}
_TABLE_COLUMNS_CACHE: dict[str, set[str]] = {}

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


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    try:
        return int(value)
    except Exception:
        return None


def _slugify_key(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return slug or "segment"


def _normalize_segment_rules(value: Any) -> dict[str, Any]:
    raw = _coerce_json(value, {}) if not isinstance(value, dict) else value
    sources = [item for item in _safe_list(raw.get("sources")) if item in SEGMENT_SOURCES]
    if not sources:
        sources = ["guest_profiles", "marketing_contacts"]

    channel = str(raw.get("channel") or "any").strip().lower()
    if channel not in {"any", *CHANNELS}:
        channel = "any"

    min_bookings = _optional_int(raw.get("min_bookings"))
    max_bookings = _optional_int(raw.get("max_bookings"))
    arrival_window_days = _optional_int(raw.get("arrival_window_days"))
    lapsed_days = _optional_int(raw.get("lapsed_days"))

    if min_bookings is not None:
        min_bookings = max(0, min_bookings)
    if max_bookings is not None:
        max_bookings = max(0, max_bookings)
    if min_bookings is not None and max_bookings is not None and max_bookings < min_bookings:
        max_bookings = min_bookings
    if arrival_window_days is not None:
        arrival_window_days = max(0, arrival_window_days)
    if lapsed_days is not None:
        lapsed_days = max(1, lapsed_days)

    return {
        "sources": sources,
        "channel": channel,
        "vip_only": _safe_bool(raw.get("vip_only"), False),
        "opt_in_only": _safe_bool(raw.get("opt_in_only"), False),
        "min_bookings": min_bookings,
        "max_bookings": max_bookings,
        "arrival_window_days": arrival_window_days,
        "lapsed_days": lapsed_days,
        "tag_any": [item for item in _safe_list(raw.get("tag_any")) if item],
        "search": (str(raw.get("search") or "").strip() or None),
        "contact_source": (str(raw.get("contact_source") or "").strip() or None),
    }


def _get_table_columns(table_name: str) -> set[str]:
    cached = _TABLE_COLUMNS_CACHE.get(table_name)
    if cached is not None:
        return cached
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            """,
            [table_name],
        )
        columns = {row[0] for row in cur.fetchall()}
    _TABLE_COLUMNS_CACHE[table_name] = columns
    return columns


def _message_template_select_sql() -> str:
    columns = _get_table_columns("message_templates")
    name_sql = "COALESCE(name, template_name)" if {"name", "template_name"} <= columns else ("name" if "name" in columns else "template_name")
    content_sql = "COALESCE(content, body)" if {"content", "body"} <= columns else ("content" if "content" in columns else "body")
    if "variables" in columns:
        variables_sql = "COALESCE(variables, '[]'::jsonb)"
    else:
        variables_sql = "'[]'::jsonb"
    if {"is_active", "status"} <= columns:
        active_sql = "COALESCE(is_active, LOWER(COALESCE(status, 'active')) = 'active')"
    elif "is_active" in columns:
        active_sql = "COALESCE(is_active, true)"
    elif "status" in columns:
        active_sql = "LOWER(COALESCE(status, 'active')) = 'active'"
    else:
        active_sql = "true"
    updated_at_sql = "COALESCE(updated_at, created_at)" if "updated_at" in columns else "created_at"
    return f"""
        SELECT id,
               tenant_id,
               {name_sql} AS name,
               channel,
               subject,
               {content_sql} AS content,
               {variables_sql} AS variables,
               {active_sql} AS is_active,
               created_at,
               {updated_at_sql} AS updated_at
        FROM message_templates
    """


def _insert_message_template(
    tenant_id: str,
    *,
    template_id: str,
    name: str,
    channel: str,
    subject: str | None,
    content: str,
    variables: list[Any],
    is_active: bool,
) -> None:
    columns = _get_table_columns("message_templates")
    insert_columns = ["id", "tenant_id"]
    placeholders = ["%s", "%s"]
    values: list[Any] = [template_id, tenant_id]

    if "name" in columns:
        insert_columns.append("name")
        placeholders.append("%s")
        values.append(name)
    if "template_name" in columns:
        insert_columns.append("template_name")
        placeholders.append("%s")
        values.append(name)
    if "channel" in columns:
        insert_columns.append("channel")
        placeholders.append("%s")
        values.append(channel)
    if "subject" in columns:
        insert_columns.append("subject")
        placeholders.append("%s")
        values.append(subject)
    if "content" in columns:
        insert_columns.append("content")
        placeholders.append("%s")
        values.append(content)
    if "body" in columns:
        insert_columns.append("body")
        placeholders.append("%s")
        values.append(content)
    if "variables" in columns:
        insert_columns.append("variables")
        placeholders.append("%s::jsonb")
        values.append(json.dumps(variables))
    if "is_active" in columns:
        insert_columns.append("is_active")
        placeholders.append("%s")
        values.append(is_active)
    if "status" in columns:
        insert_columns.append("status")
        placeholders.append("%s")
        values.append("active" if is_active else "inactive")

    with connection.cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO message_templates ({", ".join(insert_columns)})
            VALUES ({", ".join(placeholders)})
            """,
            values,
        )


def create_message_template(
    tenant_id: str,
    *,
    name: str,
    channel: str,
    subject: str | None,
    content: str,
    variables: list[Any],
    is_active: bool = True,
) -> dict[str, Any] | None:
    template_id = str(uuid.uuid4())
    _insert_message_template(
        tenant_id,
        template_id=template_id,
        name=name,
        channel=channel,
        subject=subject,
        content=content,
        variables=variables,
        is_active=is_active,
    )
    return get_message_template_by_id(tenant_id, template_id)


def update_message_template(
    tenant_id: str,
    template_id: str,
    *,
    name: str,
    channel: str,
    subject: str | None,
    content: str,
    variables: list[Any],
    is_active: bool,
) -> dict[str, Any] | None:
    columns = _get_table_columns("message_templates")
    assignments: list[str] = []
    values: list[Any] = []

    if "name" in columns:
        assignments.append("name = %s")
        values.append(name)
    if "template_name" in columns:
        assignments.append("template_name = %s")
        values.append(name)
    if "channel" in columns:
        assignments.append("channel = %s")
        values.append(channel)
    if "subject" in columns:
        assignments.append("subject = %s")
        values.append(subject)
    if "content" in columns:
        assignments.append("content = %s")
        values.append(content)
    if "body" in columns:
        assignments.append("body = %s")
        values.append(content)
    if "variables" in columns:
        assignments.append("variables = %s::jsonb")
        values.append(json.dumps(variables))
    if "is_active" in columns:
        assignments.append("is_active = %s")
        values.append(is_active)
    if "status" in columns:
        assignments.append("status = %s")
        values.append("active" if is_active else "inactive")
    if "updated_at" in columns:
        assignments.append("updated_at = NOW()")

    if not assignments:
        return None

    with connection.cursor() as cur:
        cur.execute(
            f"""
            UPDATE message_templates
            SET {", ".join(assignments)}
            WHERE tenant_id = %s AND id = %s
            """,
            values + [tenant_id, template_id],
        )
        if cur.rowcount == 0:
            return None

    return get_message_template_by_id(tenant_id, template_id)


def _message_logs_select_sql() -> str:
    columns = _get_table_columns("message_logs")

    def col(column_name: str, default_sql: str = "NULL") -> str:
        return column_name if column_name in columns else default_sql

    return f"""
        SELECT id,
               tenant_id,
               {col("campaign_id")} AS campaign_id,
               {col("template_id")} AS template_id,
               {col("channel", "'email'::text")} AS channel,
               {col("source", "'messaging'::text")} AS source,
               {col("recipient_name")} AS recipient_name,
               {col("recipient_email")} AS recipient_email,
               {col("recipient_phone")} AS recipient_phone,
               {col("subject")} AS subject,
               {col("content")} AS content,
               {col("status", "'logged'::text")} AS status,
               {col("metadata", "'{}'::jsonb")} AS metadata,
               {col("created_at", "NOW()")} AS created_at
        FROM message_logs
    """


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
            _insert_message_template(
                tenant_id,
                template_id=str(uuid.uuid4()),
                name=template["name"],
                channel=template["channel"],
                subject=template["subject"] or None,
                content=template["content"],
                variables=template.get("variables", []),
                is_active=True,
            )


def get_message_templates(tenant_id: str) -> list[dict[str, Any]]:
    ensure_default_message_templates(tenant_id)
    with connection.cursor() as cur:
        cur.execute(
            _message_template_select_sql() + """
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
            _message_template_select_sql() + """
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
            _message_logs_select_sql() + """
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


def get_message_log_by_id(tenant_id: str, log_id: str) -> dict[str, Any] | None:
    with connection.cursor() as cur:
        cur.execute(
            _message_logs_select_sql() + """
            WHERE tenant_id = %s AND id = %s
            """,
            [tenant_id, log_id],
        )
        row = cur.fetchone()
        if not row:
            return None
        data = _serialize(row, [c[0] for c in cur.description])
    data["metadata"] = _coerce_json(data.get("metadata"), {})
    return data


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


def get_custom_segments(tenant_id: str) -> list[dict[str, Any]]:
    if not _get_table_columns("marketing_segments"):
        return []
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT id, tenant_id, key, name, description, rules, is_active, created_at, updated_at
            FROM marketing_segments
            WHERE tenant_id = %s AND is_active = true
            ORDER BY updated_at DESC, created_at DESC
            """,
            [tenant_id],
        )
        cols = [c[0] for c in cur.description]
        rows = [_serialize(row, cols) for row in cur.fetchall()]
    for row in rows:
        row["rules"] = _normalize_segment_rules(row.get("rules"))
        row["kind"] = "custom"
        row["is_custom"] = True
        row["editable"] = True
    return rows


def create_custom_segment(tenant_id: str, *, name: str, description: str | None, rules: Any) -> dict[str, Any]:
    normalized_rules = _normalize_segment_rules(rules)
    base_key = f"custom-{_slugify_key(name)}"
    candidate_key = base_key
    suffix = 2

    with connection.cursor() as cur:
        while True:
            cur.execute(
                "SELECT 1 FROM marketing_segments WHERE tenant_id = %s AND key = %s LIMIT 1",
                [tenant_id, candidate_key],
            )
            if not cur.fetchone():
                break
            candidate_key = f"{base_key}-{suffix}"
            suffix += 1

        cur.execute(
            """
            INSERT INTO marketing_segments (id, tenant_id, key, name, description, rules, is_active)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb, true)
            RETURNING id, tenant_id, key, name, description, rules, is_active, created_at, updated_at
            """,
            [str(uuid.uuid4()), tenant_id, candidate_key, name, description, json.dumps(normalized_rules)],
        )
        row = _serialize(cur.fetchone(), [c[0] for c in cur.description])
    row["rules"] = normalized_rules
    row["kind"] = "custom"
    row["is_custom"] = True
    row["editable"] = True
    return row


def update_custom_segment(segment_id: str, tenant_id: str, *, name: str, description: str | None, rules: Any) -> dict[str, Any] | None:
    normalized_rules = _normalize_segment_rules(rules)
    with connection.cursor() as cur:
        cur.execute(
            """
            UPDATE marketing_segments
            SET name = %s,
                description = %s,
                rules = %s::jsonb,
                updated_at = NOW()
            WHERE id = %s AND tenant_id = %s AND is_active = true
            RETURNING id, tenant_id, key, name, description, rules, is_active, created_at, updated_at
            """,
            [name, description, json.dumps(normalized_rules), segment_id, tenant_id],
        )
        row = cur.fetchone()
        if not row:
            return None
        data = _serialize(row, [c[0] for c in cur.description])
    data["rules"] = normalized_rules
    data["kind"] = "custom"
    data["is_custom"] = True
    data["editable"] = True
    return data


def archive_custom_segment(segment_id: str, tenant_id: str) -> bool:
    with connection.cursor() as cur:
        cur.execute(
            """
            UPDATE marketing_segments
            SET is_active = false, updated_at = NOW()
            WHERE id = %s AND tenant_id = %s AND is_active = true
            """,
            [segment_id, tenant_id],
        )
        return cur.rowcount > 0


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
        "contact_source": contact.get("source"),
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


def _dedupe_recipients(recipients: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}
    for recipient in recipients:
        deduped[_recipient_key(recipient)] = recipient
    return list(deduped.values())


def _base_segment_recipients(
    guests: list[dict[str, Any]], contacts: list[dict[str, Any]]
) -> dict[str, list[dict[str, Any]]]:
    today = date.today()
    in_30_days = today + timedelta(days=30)
    ninety_days_ago = today - timedelta(days=90)

    return {
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


def _matches_custom_segment(recipient: dict[str, Any], rules: dict[str, Any]) -> bool:
    if recipient.get("source") not in rules.get("sources", []):
        return False

    channel = rules.get("channel") or "any"
    if channel != "any" and not _supports_channel(recipient, channel):
        return False

    if rules.get("vip_only") and not _safe_bool(recipient.get("is_vip"), False):
        return False

    if rules.get("opt_in_only"):
        if recipient.get("source") != "marketing_contacts":
            return False
        if channel == "email":
            if not _safe_bool(recipient.get("email_opt_in"), False):
                return False
        elif channel == "whatsapp":
            if not _safe_bool(recipient.get("whatsapp_opt_in"), False):
                return False
        elif not (_safe_bool(recipient.get("email_opt_in"), False) or _safe_bool(recipient.get("whatsapp_opt_in"), False)):
            return False

    booking_count = _safe_int(recipient.get("booking_count"), 0)
    min_bookings = rules.get("min_bookings")
    max_bookings = rules.get("max_bookings")
    if min_bookings is not None and booking_count < min_bookings:
        return False
    if max_bookings is not None and booking_count > max_bookings:
        return False

    next_check_in = _parse_iso_date(recipient.get("next_check_in"))
    arrival_window_days = rules.get("arrival_window_days")
    if arrival_window_days is not None:
        if not next_check_in:
            return False
        today = date.today()
        if not (today <= next_check_in <= today + timedelta(days=arrival_window_days)):
            return False

    lapsed_days = rules.get("lapsed_days")
    if lapsed_days is not None:
        last_checkout = _parse_iso_date(recipient.get("last_checkout"))
        if not last_checkout or last_checkout >= date.today() - timedelta(days=lapsed_days) or next_check_in:
            return False

    tag_any = [item.strip().lower() for item in rules.get("tag_any") or [] if str(item).strip()]
    if tag_any:
        recipient_tags = {str(item).strip().lower() for item in recipient.get("tags") or [] if str(item).strip()}
        if not recipient_tags.intersection(tag_any):
            return False

    contact_source = rules.get("contact_source")
    if contact_source and recipient.get("contact_source") != contact_source:
        return False

    search = (rules.get("search") or "").strip().lower()
    if search:
        haystack = " ".join(
            str(value)
            for value in [
                recipient.get("name"),
                recipient.get("email"),
                recipient.get("phone"),
                recipient.get("contact_source"),
                " ".join(recipient.get("tags") or []),
            ]
            if value
        ).lower()
        if search not in haystack:
            return False

    return True


def _build_segment_catalog(tenant_id: str) -> dict[str, dict[str, Any]]:
    guests = get_guest_audience(tenant_id)
    contacts = get_marketing_contacts(tenant_id)
    catalog: dict[str, dict[str, Any]] = {}

    base_recipients = _base_segment_recipients(guests, contacts)
    for definition in SEGMENT_DEFINITIONS:
        deduped = _dedupe_recipients(base_recipients.get(definition["key"], []))
        catalog[definition["key"]] = {
            **definition,
            "kind": "built_in",
            "is_custom": False,
            "editable": False,
            "rules": None,
            "recipients": deduped,
        }

    candidate_recipients = [_guest_to_recipient(guest) for guest in guests] + [
        _contact_to_recipient(contact) for contact in contacts
    ]
    for custom_segment in get_custom_segments(tenant_id):
        rules = custom_segment.get("rules") or {}
        matched = [recipient for recipient in candidate_recipients if _matches_custom_segment(recipient, rules)]
        catalog[custom_segment["key"]] = {
            **custom_segment,
            "recipients": _dedupe_recipients(matched),
        }

    return catalog


def build_segments(tenant_id: str) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    for segment in _build_segment_catalog(tenant_id).values():
        deduped_list = segment.get("recipients", [])
        segments.append(
            {
                "id": segment.get("id"),
                "key": segment["key"],
                "name": segment["name"],
                "description": segment.get("description"),
                "kind": segment.get("kind", "built_in"),
                "is_custom": _safe_bool(segment.get("is_custom"), False),
                "editable": _safe_bool(segment.get("editable"), False),
                "rules": segment.get("rules"),
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
        segment_catalog = _build_segment_catalog(tenant_id)
        if segment_key not in segment_catalog:
            raise ValueError("Unknown segment")
        recipients.extend(segment_catalog[segment_key].get("recipients", []))

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
    columns = _get_table_columns("message_logs")
    with connection.cursor() as cur:
        for recipient in recipients:
            subject = render_with_variables(subject_template, recipient, tenant)
            content = render_with_variables(content_template, recipient, tenant) or ""
            log_id = str(uuid.uuid4())
            insert_columns = ["id", "tenant_id"]
            placeholders = ["%s", "%s"]
            values: list[Any] = [log_id, tenant_id]

            def add(column_name: str, value: Any, *, as_json: bool = False) -> None:
                if column_name not in columns:
                    return
                insert_columns.append(column_name)
                placeholders.append("%s::jsonb" if as_json else "%s")
                values.append(json.dumps(value) if as_json else value)

            add("campaign_id", campaign_id)
            add("template_id", template_id)
            add("channel", channel)
            add("source", source)
            add("recipient_name", recipient.get("name"))
            add("recipient_email", recipient.get("email"))
            add("recipient_phone", recipient.get("phone"))
            add("subject", subject)
            add("content", content)
            add("status", status)
            add("metadata", metadata, as_json=True)
            cur.execute(
                f"""
                INSERT INTO message_logs ({", ".join(insert_columns)})
                VALUES ({", ".join(placeholders)})
                """,
                values,
            )
            created_row = get_message_log_by_id(tenant_id, log_id)
            if created_row:
                created.append(created_row)
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
