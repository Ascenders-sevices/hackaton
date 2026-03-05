import uuid
from decimal import Decimal
from django.db import connection
from rest_framework.views import APIView
from rest_framework.response import Response


def _serialize(row, columns):
    obj = dict(zip(columns, row))
    for k, v in obj.items():
        if isinstance(v, uuid.UUID):
            obj[k] = str(v)
        elif isinstance(v, Decimal):
            obj[k] = float(v)
        elif hasattr(v, "isoformat"):
            obj[k] = v.isoformat()
    return obj


class SettingsView(APIView):
    def get(self, request):
        tenant_id = request.user.tenant_id
        user_sub = request.user.sub
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, slug, domain, settings, gst_enabled, gst_percentage, gst_number,
                       service_charge_enabled, service_charge_percentage, email_settings,
                       contact_email, contact_phone, address, currency, timezone, logo_url,
                       created_at, updated_at
                FROM tenants
                WHERE id = %s
                """,
                [tenant_id],
            )
            tenant_row = cur.fetchone()
            tenant_cols = [c[0] for c in cur.description]

            cur.execute(
                """
                SELECT id, tenant_id, full_name, phone, avatar_url, created_at, updated_at
                FROM profiles
                WHERE id = %s
                """,
                [user_sub],
            )
            profile_row = cur.fetchone()
            profile_cols = [c[0] for c in cur.description]

            cur.execute(
                """
                SELECT id, tenant_id, name, color, display_order, description, created_at, updated_at
                FROM room_categories
                WHERE tenant_id = %s
                ORDER BY display_order, name
                """,
                [tenant_id],
            )
            category_cols = [c[0] for c in cur.description]
            category_rows = [_serialize(r, category_cols) for r in cur.fetchall()]

        return Response(
            {
                "tenant": _serialize(tenant_row, tenant_cols) if tenant_row else None,
                "profile": _serialize(profile_row, profile_cols) if profile_row else None,
                "room_categories": category_rows,
            }
        )

    def put(self, request):
        tenant_id = request.user.tenant_id
        d = request.data
        with connection.cursor() as cur:
            cur.execute(
                """
                UPDATE tenants SET
                    name = COALESCE(%s, name),
                    contact_email = COALESCE(%s, contact_email),
                    contact_phone = COALESCE(%s, contact_phone),
                    address = COALESCE(%s, address),
                    timezone = COALESCE(%s, timezone),
                    currency = COALESCE(%s, currency),
                    gst_enabled = COALESCE(%s, gst_enabled),
                    gst_percentage = COALESCE(%s, gst_percentage),
                    gst_number = COALESCE(%s, gst_number),
                    service_charge_enabled = COALESCE(%s, service_charge_enabled),
                    service_charge_percentage = COALESCE(%s, service_charge_percentage),
                    updated_at = NOW()
                WHERE id = %s
                """,
                [
                    d.get("name"), d.get("contact_email"), d.get("contact_phone"),
                    d.get("address"), d.get("timezone"), d.get("currency"),
                    d.get("gst_enabled"), d.get("gst_percentage"), d.get("gst_number"),
                    d.get("service_charge_enabled"), d.get("service_charge_percentage"),
                    tenant_id,
                ],
            )
        return Response({"success": True})


class RoomCategoriesView(APIView):
    def get(self, request):
        tenant_id = request.user.tenant_id
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT id, tenant_id, name, color, display_order, description, created_at, updated_at
                FROM room_categories
                WHERE tenant_id = %s
                ORDER BY display_order, name
                """,
                [tenant_id],
            )
            cols = [c[0] for c in cur.description]
            rows = [_serialize(r, cols) for r in cur.fetchall()]
        return Response(rows)
