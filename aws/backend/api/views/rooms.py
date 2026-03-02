import uuid
from decimal import Decimal
from django.db import connection
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status


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


class RoomList(APIView):
    def get(self, request):
        tenant_id = request.user.tenant_id
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT r.id, r.name, r.room_number, r.floor, r.status,
                       r.housekeeping_status, r.base_price, r.current_price,
                       rc.name AS category_name, r.category_id,
                       r.amenities, r.max_occupancy, r.description, r.created_at
                FROM rooms r
                LEFT JOIN room_categories rc ON r.category_id = rc.id
                WHERE r.tenant_id = %s
                ORDER BY r.room_number
                """,
                [tenant_id],
            )
            cols = [c[0] for c in cur.description]
            rows = [_serialize(r, cols) for r in cur.fetchall()]
        return Response(rows)

    def post(self, request):
        tenant_id = request.user.tenant_id
        d = request.data
        room_id = str(uuid.uuid4())
        with connection.cursor() as cur:
            cur.execute(
                """
                INSERT INTO rooms (id, tenant_id, name, room_number, floor, category_id,
                                   base_price, current_price, max_occupancy, description,
                                   amenities, status, housekeeping_status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                        COALESCE(%s,'available'), COALESCE(%s,'clean'))
                """,
                [
                    room_id, tenant_id,
                    d.get("name"), d.get("room_number"), d.get("floor"),
                    d.get("category_id"), d.get("base_price"), d.get("current_price"),
                    d.get("max_occupancy", 2), d.get("description"),
                    d.get("amenities", []),
                    d.get("status"), d.get("housekeeping_status"),
                ],
            )
        return Response({"id": room_id}, status=status.HTTP_201_CREATED)


class RoomDetail(APIView):
    def put(self, request, room_id):
        tenant_id = request.user.tenant_id
        d = request.data
        with connection.cursor() as cur:
            cur.execute(
                """
                UPDATE rooms SET
                    name = COALESCE(%s, name),
                    status = COALESCE(%s, status),
                    housekeeping_status = COALESCE(%s, housekeeping_status),
                    base_price = COALESCE(%s, base_price),
                    current_price = COALESCE(%s, current_price),
                    description = COALESCE(%s, description),
                    updated_at = NOW()
                WHERE id = %s AND tenant_id = %s
                """,
                [
                    d.get("name"), d.get("status"), d.get("housekeeping_status"),
                    d.get("base_price"), d.get("current_price"), d.get("description"),
                    room_id, tenant_id,
                ],
            )
        return Response({"success": True})

    def delete(self, request, room_id):
        tenant_id = request.user.tenant_id
        with connection.cursor() as cur:
            cur.execute(
                "DELETE FROM rooms WHERE id = %s AND tenant_id = %s",
                [room_id, tenant_id],
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
