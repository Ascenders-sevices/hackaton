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


class GuestList(APIView):
    def get(self, request):
        tenant_id = request.user.tenant_id
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT gp.id, gp.full_name, gp.email, gp.phone,
                       gp.nationality, gp.date_of_birth, gp.loyalty_tier,
                       gp.total_stays, gp.total_spent, gp.preferences,
                       gp.created_at,
                       COUNT(b.id) AS booking_count
                FROM guest_profiles gp
                LEFT JOIN bookings b ON b.guest_profile_id = gp.id AND b.tenant_id = %s
                WHERE gp.tenant_id = %s
                GROUP BY gp.id
                ORDER BY gp.created_at DESC
                """,
                [tenant_id, tenant_id],
            )
            cols = [c[0] for c in cur.description]
            rows = [_serialize(r, cols) for r in cur.fetchall()]
        return Response(rows)

    def post(self, request):
        tenant_id = request.user.tenant_id
        d = request.data
        guest_id = str(uuid.uuid4())
        with connection.cursor() as cur:
            cur.execute(
                """
                INSERT INTO guest_profiles (id, tenant_id, full_name, email, phone,
                                            nationality, date_of_birth, loyalty_tier,
                                            preferences)
                VALUES (%s,%s,%s,%s,%s,%s,%s,COALESCE(%s,'bronze'),%s)
                """,
                [
                    guest_id, tenant_id,
                    d.get("full_name"), d.get("email"), d.get("phone"),
                    d.get("nationality"), d.get("date_of_birth"),
                    d.get("loyalty_tier"), d.get("preferences", {}),
                ],
            )
        return Response({"id": guest_id}, status=status.HTTP_201_CREATED)


class GuestDetail(APIView):
    def put(self, request, guest_id):
        tenant_id = request.user.tenant_id
        d = request.data
        with connection.cursor() as cur:
            cur.execute(
                """
                UPDATE guest_profiles SET
                    full_name = COALESCE(%s, full_name),
                    email = COALESCE(%s, email),
                    phone = COALESCE(%s, phone),
                    loyalty_tier = COALESCE(%s, loyalty_tier),
                    preferences = COALESCE(%s, preferences),
                    updated_at = NOW()
                WHERE id = %s AND tenant_id = %s
                """,
                [
                    d.get("full_name"), d.get("email"), d.get("phone"),
                    d.get("loyalty_tier"), d.get("preferences"),
                    guest_id, tenant_id,
                ],
            )
        return Response({"success": True})

    def delete(self, request, guest_id):
        tenant_id = request.user.tenant_id
        with connection.cursor() as cur:
            cur.execute(
                "DELETE FROM guest_profiles WHERE id = %s AND tenant_id = %s",
                [guest_id, tenant_id],
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
