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
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, slug, contact_email, contact_phone,
                       address, city, country, timezone, currency,
                       check_in_time, check_out_time, settings, created_at
                FROM tenants
                WHERE id = %s
                """,
                [tenant_id],
            )
            cols = [c[0] for c in cur.description]
            row = cur.fetchone()
        if not row:
            return Response({}, status=404)
        return Response(_serialize(row, cols))

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
                    city = COALESCE(%s, city),
                    country = COALESCE(%s, country),
                    timezone = COALESCE(%s, timezone),
                    currency = COALESCE(%s, currency),
                    check_in_time = COALESCE(%s, check_in_time),
                    check_out_time = COALESCE(%s, check_out_time),
                    settings = COALESCE(%s, settings),
                    updated_at = NOW()
                WHERE id = %s
                """,
                [
                    d.get("name"), d.get("contact_email"), d.get("contact_phone"),
                    d.get("address"), d.get("city"), d.get("country"),
                    d.get("timezone"), d.get("currency"),
                    d.get("check_in_time"), d.get("check_out_time"),
                    d.get("settings"),
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
                SELECT id, name, description, base_price, amenities
                FROM room_categories
                WHERE tenant_id = %s
                ORDER BY name
                """,
                [tenant_id],
            )
            cols = [c[0] for c in cur.description]
            rows = [_serialize(r, cols) for r in cur.fetchall()]
        return Response(rows)
