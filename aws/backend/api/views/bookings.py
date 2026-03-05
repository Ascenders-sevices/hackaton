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
                SELECT b.*,
                       r.name AS room_name,
                       r.base_price AS room_base_price
                FROM bookings b
                LEFT JOIN rooms r ON b.room_id = r.id
                WHERE b.tenant_id = %s
                ORDER BY b.created_at DESC
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
                INSERT INTO bookings (
                    id, tenant_id, room_id, guest_id,
                    guest_name, guest_email, guest_phone,
                    check_in, check_out, guests,
                    total_amount, base_amount,
                    status, payment_status, notes
                )
                VALUES (
                    %s,%s,%s,%s,
                    %s,%s,%s,
                    %s,%s,COALESCE(%s,1),
                    COALESCE(%s,0), COALESCE(%s,0),
                    COALESCE(%s,'pending'),
                    COALESCE(%s,'unpaid'),
                    %s
                )
                RETURNING id, tenant_id, room_id, guest_id, guest_name, guest_email, guest_phone,
                          check_in, check_out, guests, total_amount, base_amount, tax_amount,
                          service_charge, status, payment_status, payment_method, amount_paid,
                          notes, created_at, updated_at
                """,
                [
                    booking_id, tenant_id,
                    d.get("room_id"), d.get("guest_id"),
                    d.get("guest_name"), d.get("guest_email"), d.get("guest_phone"),
                    d.get("check_in"), d.get("check_out"), d.get("guests", 1),
                    d.get("total_amount"), d.get("total_amount"),
                    d.get("status"), d.get("payment_status"),
                    d.get("notes"),
                ],
            )
            cols = [c[0] for c in cur.description]
            row = _serialize(cur.fetchone(), cols)
        return Response(row, status=status.HTTP_201_CREATED)


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
                    amount_paid = COALESCE(%s, amount_paid),
                    notes = COALESCE(%s, notes),
                    updated_at = NOW()
                WHERE id = %s AND tenant_id = %s
                RETURNING id, tenant_id, room_id, guest_id, guest_name, guest_email, guest_phone,
                          check_in, check_out, guests, total_amount, base_amount, tax_amount,
                          service_charge, status, payment_status, payment_method, amount_paid,
                          notes, created_at, updated_at
                """,
                [
                    d.get("status"), d.get("payment_status"),
                    d.get("amount_paid"), d.get("notes"),
                    booking_id, tenant_id,
                ],
            )
            row = cur.fetchone()
            if not row:
                return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
            cols = [c[0] for c in cur.description]
        return Response(_serialize(row, cols))
