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


class HousekeepingList(APIView):
    def get(self, request):
        tenant_id = request.user.tenant_id
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, housekeeping_status, status, category_id
                FROM rooms
                WHERE tenant_id = %s
                ORDER BY name
                """,
                [tenant_id],
            )
            cols = [c[0] for c in cur.description]
            rows = [_serialize(r, cols) for r in cur.fetchall()]
        return Response(rows)


class HousekeepingDetail(APIView):
    def put(self, request, room_id):
        tenant_id = request.user.tenant_id
        new_status = request.data.get("housekeeping_status")
        valid = {"clean", "dirty", "in_progress", "inspecting"}
        if new_status not in valid:
            return Response({"error": "Invalid status"}, status=400)
        with connection.cursor() as cur:
            cur.execute(
                """
                UPDATE rooms SET housekeeping_status = %s, updated_at = NOW()
                WHERE id = %s AND tenant_id = %s
                RETURNING id, name, housekeeping_status
                """,
                [new_status, room_id, tenant_id],
            )
            row = cur.fetchone()
            if not row:
                return Response({"error": "Not found"}, status=404)
            cols = [c[0] for c in cur.description]
        return Response(_serialize(row, cols))
