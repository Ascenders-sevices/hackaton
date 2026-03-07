import uuid
from decimal import Decimal
from django.db import connection
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

ALLOWED_ROOM_STATUS = {"available", "maintenance", "unavailable"}
ALLOWED_HOUSEKEEPING_STATUS = {"clean", "dirty", "in_progress", "inspecting"}


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


def _safe_int(value, default):
    try:
        return int(value)
    except Exception:
        return default


def _safe_float(value, default):
    try:
        return float(value)
    except Exception:
        return default


def _normalize_room_payload(data):
    return {
        "name": (data.get("name") or "").strip(),
        "description": (data.get("description") or "").strip() or None,
        "category_id": (data.get("category_id") or "").strip() or None,
        "max_guests": max(1, _safe_int(data.get("max_guests"), 2)),
        "base_price": max(0.0, _safe_float(data.get("base_price"), 0.0)),
        "status": (data.get("status") or "").strip() or None,
        "housekeeping_status": (data.get("housekeeping_status") or "").strip() or None,
    }


class RoomList(APIView):
    def get(self, request):
        tenant_id = request.user.tenant_id
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT r.id, r.name, r.description, r.category_id,
                       r.max_guests, r.base_price, r.status, r.housekeeping_status,
                       r.amenities, r.images, r.created_at
                FROM rooms r
                WHERE r.tenant_id = %s
                ORDER BY r.created_at DESC
                """,
                [tenant_id],
            )
            cols = [c[0] for c in cur.description]
            rows = [_serialize(r, cols) for r in cur.fetchall()]
        return Response(rows)

    def post(self, request):
        tenant_id = request.user.tenant_id
        d = _normalize_room_payload(request.data)
        if not d["name"]:
            return Response({"error": "Room name is required"}, status=status.HTTP_400_BAD_REQUEST)
        if d["status"] and d["status"] not in ALLOWED_ROOM_STATUS:
            return Response({"error": "Invalid room status"}, status=status.HTTP_400_BAD_REQUEST)
        if d["housekeeping_status"] and d["housekeeping_status"] not in ALLOWED_HOUSEKEEPING_STATUS:
            return Response({"error": "Invalid housekeeping status"}, status=status.HTTP_400_BAD_REQUEST)
        room_id = str(uuid.uuid4())
        try:
            with connection.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO rooms (id, tenant_id, name, description, category_id,
                                       max_guests, base_price, status, housekeeping_status)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,
                            COALESCE(%s,'available'),
                            COALESCE(%s,'clean'))
                    """,
                    [
                        room_id,
                        tenant_id,
                        d["name"],
                        d["description"],
                        d["category_id"],
                        d["max_guests"],
                        d["base_price"],
                        d["status"],
                        d["housekeeping_status"],
                    ],
                )
        except Exception as exc:
            print(f"Room create error: {exc}")
            return Response(
                {"error": f"Could not create room: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"id": room_id}, status=status.HTTP_201_CREATED)


class RoomDetail(APIView):
    def put(self, request, room_id):
        tenant_id = request.user.tenant_id
        d = _normalize_room_payload(request.data)
        if d["status"] and d["status"] not in ALLOWED_ROOM_STATUS:
            return Response({"error": "Invalid room status"}, status=status.HTTP_400_BAD_REQUEST)
        if d["housekeeping_status"] and d["housekeeping_status"] not in ALLOWED_HOUSEKEEPING_STATUS:
            return Response({"error": "Invalid housekeeping status"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            with connection.cursor() as cur:
                cur.execute(
                    """
                    UPDATE rooms SET
                        name = COALESCE(%s, name),
                        description = COALESCE(%s, description),
                        category_id = COALESCE(%s, category_id),
                        max_guests = COALESCE(%s, max_guests),
                        status = COALESCE(%s, status),
                        housekeeping_status = COALESCE(%s, housekeeping_status),
                        base_price = COALESCE(%s, base_price),
                        updated_at = NOW()
                    WHERE id = %s AND tenant_id = %s
                    """,
                    [
                        d["name"] or None,
                        d["description"],
                        d["category_id"],
                        d["max_guests"],
                        d["status"],
                        d["housekeeping_status"],
                        d["base_price"],
                        room_id,
                        tenant_id,
                    ],
                )
        except Exception as exc:
            print(f"Room update error: {exc}")
            return Response(
                {"error": f"Could not update room: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
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
