import json
import uuid
from datetime import datetime
from decimal import Decimal

from django.db import connection
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


def _serialize(row, columns):
    obj = dict(zip(columns, row))
    for key, value in obj.items():
        if key in {"amenities", "images"} and isinstance(value, str):
            try:
                obj[key] = json.loads(value)
                continue
            except json.JSONDecodeError:
                pass
        if isinstance(value, uuid.UUID):
            obj[key] = str(value)
        elif isinstance(value, Decimal):
            obj[key] = float(value)
        elif hasattr(value, "isoformat"):
            obj[key] = value.isoformat()
    return obj


def _parse_date(raw_value):
    try:
        return datetime.strptime(str(raw_value), "%Y-%m-%d").date()
    except Exception:
        return None


def _safe_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return default


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return default


def _get_property(slug):
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, slug, contact_email, contact_phone, address, currency, timezone,
                   logo_url, gst_enabled, gst_percentage, service_charge_enabled,
                   service_charge_percentage
            FROM tenants
            WHERE slug = %s
            """,
            [slug],
        )
        row = cur.fetchone()
        if not row:
            return None
        cols = [c[0] for c in cur.description]
        return _serialize(row, cols)


def _calculate_pricing(property_data, room, guests, nights):
    base_price = _safe_float(room.get("base_price"))
    base_occupancy = max(1, _safe_int(room.get("base_occupancy"), 2))
    extra_guest_fee = _safe_float(room.get("extra_guest_fee"))
    extra_guest_count = max(0, guests - base_occupancy)

    base_amount = round(base_price * nights, 2)
    extra_guest_total = round(extra_guest_fee * extra_guest_count * nights, 2)
    subtotal = round(base_amount + extra_guest_total, 2)

    gst_percentage = _safe_float(property_data.get("gst_percentage")) if property_data.get("gst_enabled") else 0.0
    service_percentage = (
        _safe_float(property_data.get("service_charge_percentage"))
        if property_data.get("service_charge_enabled")
        else 0.0
    )

    tax_amount = round(subtotal * (gst_percentage / 100.0), 2)
    service_charge = round(subtotal * (service_percentage / 100.0), 2)
    total_amount = round(subtotal + tax_amount + service_charge, 2)

    return {
        "nights": nights,
        "base_amount": base_amount,
        "extra_guest_total": extra_guest_total,
        "tax_amount": tax_amount,
        "service_charge": service_charge,
        "total_amount": total_amount,
    }


def _fetch_rooms(tenant_id, check_in=None, check_out=None, guests=1):
    query = """
        SELECT r.id, r.name, r.description, r.max_guests, r.base_price, r.status,
               r.amenities, r.images, r.minimum_stay, r.base_occupancy, r.extra_guest_fee,
               r.check_in_time, r.check_out_time, r.cancellation_policy,
               rc.name AS category_name
        FROM rooms r
        LEFT JOIN room_categories rc ON rc.id = r.category_id
        WHERE r.tenant_id = %s
          AND r.status = 'available'
          AND COALESCE(r.max_guests, 1) >= %s
    """
    params = [tenant_id, guests]

    if check_in and check_out:
        query += """
          AND NOT EXISTS (
              SELECT 1
              FROM bookings b
              WHERE b.room_id = r.id
                AND b.tenant_id = r.tenant_id
                AND b.status IN ('pending', 'confirmed')
                AND b.check_in < %s
                AND b.check_out > %s
          )
        """
        params.extend([check_out, check_in])

    query += " ORDER BY r.base_price ASC, r.name ASC"

    with connection.cursor() as cur:
        cur.execute(query, params)
        cols = [c[0] for c in cur.description]
        return [_serialize(row, cols) for row in cur.fetchall()]


class PublicPropertyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, property_slug):
        property_data = _get_property(property_slug)
        if not property_data:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)

        check_in_raw = request.GET.get("check_in")
        check_out_raw = request.GET.get("check_out")
        guests = max(1, _safe_int(request.GET.get("guests"), 1))

        check_in = _parse_date(check_in_raw) if check_in_raw else None
        check_out = _parse_date(check_out_raw) if check_out_raw else None

        if (check_in_raw and not check_in) or (check_out_raw and not check_out):
            return Response(
                {"error": "Dates must be in YYYY-MM-DD format"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if check_in and check_out and check_out <= check_in:
            return Response(
                {"error": "Check-out must be after check-in"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rooms = _fetch_rooms(property_data["id"], check_in, check_out, guests)
        nights = (check_out - check_in).days if check_in and check_out else 0

        for room in rooms:
            if nights > 0:
                room["pricing"] = _calculate_pricing(property_data, room, guests, nights)

        return Response(
            {
                "property": property_data,
                "rooms": rooms,
                "search": {
                    "check_in": check_in.isoformat() if check_in else None,
                    "check_out": check_out.isoformat() if check_out else None,
                    "guests": guests,
                    "nights": nights,
                },
            }
        )


class PublicBookingCreateView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, property_slug):
        property_data = _get_property(property_slug)
        if not property_data:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)

        payload = request.data
        room_id = payload.get("room_id")
        guest_name = (payload.get("guest_name") or "").strip()
        guest_email = (payload.get("guest_email") or "").strip()
        guest_phone = (payload.get("guest_phone") or "").strip()
        notes = (payload.get("notes") or "").strip()
        guests = max(1, _safe_int(payload.get("guests"), 1))
        check_in = _parse_date(payload.get("check_in"))
        check_out = _parse_date(payload.get("check_out"))

        if not room_id or not guest_name or not guest_email or not check_in or not check_out:
            return Response(
                {"error": "room_id, guest_name, guest_email, check_in, and check_out are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if check_out <= check_in:
            return Response(
                {"error": "Check-out must be after check-in"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT id, tenant_id, name, description, max_guests, base_price, status,
                       minimum_stay, base_occupancy, extra_guest_fee,
                       check_in_time, check_out_time, cancellation_policy
                FROM rooms
                WHERE id = %s AND tenant_id = %s
                """,
                [room_id, property_data["id"]],
            )
            room_row = cur.fetchone()
            if not room_row:
                return Response({"error": "Room not found"}, status=status.HTTP_404_NOT_FOUND)
            room_cols = [c[0] for c in cur.description]
            room = _serialize(room_row, room_cols)

            if room.get("status") != "available":
                return Response(
                    {"error": "This room is not open for booking"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if guests > _safe_int(room.get("max_guests"), 1):
                return Response(
                    {"error": "Selected room does not support that many guests"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            nights = (check_out - check_in).days
            minimum_stay = max(1, _safe_int(room.get("minimum_stay"), 1))
            if nights < minimum_stay:
                return Response(
                    {"error": f"Minimum stay for this room is {minimum_stay} night(s)"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            cur.execute(
                """
                SELECT 1
                FROM bookings
                WHERE tenant_id = %s
                  AND room_id = %s
                  AND status IN ('pending', 'confirmed')
                  AND check_in < %s
                  AND check_out > %s
                LIMIT 1
                """,
                [property_data["id"], room_id, check_out, check_in],
            )
            if cur.fetchone():
                return Response(
                    {"error": "That room is no longer available for the selected dates"},
                    status=status.HTTP_409_CONFLICT,
                )

            pricing = _calculate_pricing(property_data, room, guests, nights)
            booking_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO bookings (
                    id, tenant_id, room_id, guest_name, guest_email, guest_phone,
                    check_in, check_out, guests, total_amount, base_amount,
                    tax_amount, service_charge, status, payment_status, notes
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, 'pending', 'unpaid', %s
                )
                RETURNING id, guest_name, guest_email, guest_phone, check_in, check_out,
                          guests, total_amount, base_amount, tax_amount, service_charge,
                          status, payment_status, notes, created_at
                """,
                [
                    booking_id,
                    property_data["id"],
                    room_id,
                    guest_name,
                    guest_email,
                    guest_phone or None,
                    check_in,
                    check_out,
                    guests,
                    pricing["total_amount"],
                    pricing["base_amount"],
                    pricing["tax_amount"],
                    pricing["service_charge"],
                    notes or None,
                ],
            )
            booking_cols = [c[0] for c in cur.description]
            booking = _serialize(cur.fetchone(), booking_cols)

        return Response(
            {
                "message": "Reservation request created successfully",
                "booking": booking,
                "property": {
                    "name": property_data["name"],
                    "slug": property_data["slug"],
                    "currency": property_data["currency"],
                },
                "room": {
                    "id": room["id"],
                    "name": room["name"],
                    "check_in_time": room.get("check_in_time"),
                    "check_out_time": room.get("check_out_time"),
                },
                "pricing": pricing,
            },
            status=status.HTTP_201_CREATED,
        )
