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
                SELECT id, tenant_id, name, email, phone, tags, is_vip, notes, created_at, updated_at
                FROM guest_profiles
                WHERE tenant_id = %s
                ORDER BY created_at DESC
                """,
                [tenant_id],
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
                INSERT INTO guest_profiles (id, tenant_id, name, email, phone, notes, is_vip, tags)
                VALUES (
                    %s,%s,%s,%s,%s,%s,
                    COALESCE(%s,false),
                    COALESCE(%s::text[], '{}'::text[])
                )
                RETURNING id, tenant_id, name, email, phone, tags, is_vip, notes, created_at, updated_at
                """,
                [
                    guest_id, tenant_id,
                    d.get("name"), d.get("email"), d.get("phone"),
                    d.get("notes"), d.get("is_vip"), d.get("tags", []),
                ],
            )
            cols = [c[0] for c in cur.description]
            row = _serialize(cur.fetchone(), cols)
        return Response(row, status=status.HTTP_201_CREATED)


class GuestDetail(APIView):
    def put(self, request, guest_id):
        tenant_id = request.user.tenant_id
        d = request.data
        with connection.cursor() as cur:
            cur.execute(
                """
                UPDATE guest_profiles SET
                    name = COALESCE(%s, name),
                    email = COALESCE(%s, email),
                    phone = COALESCE(%s, phone),
                    notes = COALESCE(%s, notes),
                    is_vip = COALESCE(%s, is_vip),
                    tags = COALESCE(%s::text[], tags),
                    updated_at = NOW()
                WHERE id = %s AND tenant_id = %s
                RETURNING id, tenant_id, name, email, phone, tags, is_vip, notes, created_at, updated_at
                """,
                [
                    d.get("name"), d.get("email"), d.get("phone"),
                    d.get("notes"), d.get("is_vip"), d.get("tags"),
                    guest_id, tenant_id,
                ],
            )
            row = cur.fetchone()
            if not row:
                return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
            cols = [c[0] for c in cur.description]
        return Response(_serialize(row, cols))

    def delete(self, request, guest_id):
        tenant_id = request.user.tenant_id
        with connection.cursor() as cur:
            cur.execute(
                "DELETE FROM guest_profiles WHERE id = %s AND tenant_id = %s",
                [guest_id, tenant_id],
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
