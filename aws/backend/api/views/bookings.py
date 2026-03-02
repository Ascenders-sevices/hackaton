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


class BookingList(APIView):
    def get(self, request):
        tenant_id = request.user.tenant_id
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT b.id, b.room_id, b.guest_profile_id,
                       r.name AS room_name, r.room_number,
                       gp.full_name AS guest_name, gp.email AS guest_email,
                       b.check_in, b.check_out, b.status,
                       b.total_amount, b.payment_status,
                       b.adults, b.children, b.special_requests, b.created_at
                FROM bookings b
                LEFT JOIN rooms r ON b.room_id = r.id
                LEFT JOIN guest_profiles gp ON b.guest_profile_id = gp.id
                WHERE b.tenant_id = %s
                ORDER BY b.check_in DESC
                """,
                [tenant_id],
            )
            cols = [c[0] for c in cur.description]
            rows = [_serialize(r, cols) for r in cur.fetchall()]
        return Response(rows)

    def post(self, request):
        tenant_id = request.user.tenant_id
        d = request.data
        booking_id = str(uuid.uuid4())
        with connection.cursor() as cur:
            cur.execute(
                """
                INSERT INTO bookings (id, tenant_id, room_id, guest_profile_id,
                                      check_in, check_out, status, total_amount,
                                      payment_status, adults, children, special_requests)
                VALUES (%s,%s,%s,%s,%s,%s,
                        COALESCE(%s,'confirmed'), %s,
                        COALESCE(%s,'pending'), %s,%s,%s)
                """,
                [
                    booking_id, tenant_id,
                    d.get("room_id"), d.get("guest_profile_id"),
                    d.get("check_in"), d.get("check_out"),
                    d.get("status"), d.get("total_amount"),
                    d.get("payment_status"),
                    d.get("adults", 1), d.get("children", 0),
                    d.get("special_requests"),
                ],
            )
        return Response({"id": booking_id}, status=status.HTTP_201_CREATED)


class BookingDetail(APIView):
    def put(self, request, booking_id):
        tenant_id = request.user.tenant_id
        d = request.data
        with connection.cursor() as cur:
            cur.execute(
                """
                UPDATE bookings SET
                    status = COALESCE(%s, status),
                    payment_status = COALESCE(%s, payment_status),
                    check_in = COALESCE(%s, check_in),
                    check_out = COALESCE(%s, check_out),
                    total_amount = COALESCE(%s, total_amount),
                    special_requests = COALESCE(%s, special_requests),
                    updated_at = NOW()
                WHERE id = %s AND tenant_id = %s
                """,
                [
                    d.get("status"), d.get("payment_status"),
                    d.get("check_in"), d.get("check_out"),
                    d.get("total_amount"), d.get("special_requests"),
                    booking_id, tenant_id,
                ],
            )
        return Response({"success": True})
