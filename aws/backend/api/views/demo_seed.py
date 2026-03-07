import json
import uuid
from datetime import timedelta

from django.db import connection
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView


def _uuid_for(tenant_id, key):
    return str(uuid.uuid5(uuid.UUID(str(tenant_id)), key))


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return default


def _compute_pricing(room, guest_count, nights, tenant):
    base_price = _safe_float(room["base_price"])
    base_occupancy = max(1, int(room.get("base_occupancy", 2)))
    extra_guest_fee = _safe_float(room.get("extra_guest_fee", 0))
    extra_guest_count = max(0, guest_count - base_occupancy)

    base_amount = round(base_price * nights, 2)
    extra_guest_total = round(extra_guest_fee * extra_guest_count * nights, 2)
    subtotal = round(base_amount + extra_guest_total, 2)

    gst_percentage = _safe_float(tenant["gst_percentage"]) if tenant["gst_enabled"] else 0.0
    service_percentage = (
        _safe_float(tenant["service_charge_percentage"]) if tenant["service_charge_enabled"] else 0.0
    )

    tax_amount = round(subtotal * (gst_percentage / 100.0), 2)
    service_charge = round(subtotal * (service_percentage / 100.0), 2)
    total_amount = round(subtotal + tax_amount + service_charge, 2)
    return base_amount, tax_amount, service_charge, total_amount


class DemoSeedView(APIView):
    def post(self, request):
        tenant_id = request.user.tenant_id
        today = timezone.now().date()

        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, currency, gst_enabled, COALESCE(gst_percentage, 0),
                       service_charge_enabled, COALESCE(service_charge_percentage, 0)
                FROM tenants
                WHERE id = %s
                """,
                [tenant_id],
            )
            tenant_row = cur.fetchone()
            if not tenant_row:
                return Response({"error": "Tenant not found"}, status=404)

            tenant = {
                "id": str(tenant_row[0]),
                "name": tenant_row[1],
                "currency": tenant_row[2] or "INR",
                "gst_enabled": bool(tenant_row[3]),
                "gst_percentage": float(tenant_row[4] or 0),
                "service_charge_enabled": bool(tenant_row[5]),
                "service_charge_percentage": float(tenant_row[6] or 0),
            }

            category_defs = [
                {
                    "name": "Standard Room",
                    "color": "#2563EB",
                    "display_order": 1,
                    "description": "Compact rooms for business and short leisure stays.",
                },
                {
                    "name": "Deluxe Room",
                    "color": "#0F766E",
                    "display_order": 2,
                    "description": "Larger rooms with workspace and premium amenities.",
                },
                {
                    "name": "Suite",
                    "color": "#B45309",
                    "display_order": 3,
                    "description": "Spacious suites for longer stays and family travel.",
                },
            ]

            category_ids = {}
            for category in category_defs:
                category_id = _uuid_for(tenant_id, f"category:{category['name']}")
                cur.execute(
                    """
                    INSERT INTO room_categories (id, tenant_id, name, color, display_order, description)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        color = EXCLUDED.color,
                        display_order = EXCLUDED.display_order,
                        description = EXCLUDED.description,
                        updated_at = NOW()
                    """,
                    [
                        category_id,
                        tenant_id,
                        category["name"],
                        category["color"],
                        category["display_order"],
                        category["description"],
                    ],
                )
                category_ids[category["name"]] = category_id

            room_defs = [
                {
                    "name": "Palm Studio 101",
                    "category": "Standard Room",
                    "description": "Street-facing queen room with fast Wi-Fi and breakfast for two.",
                    "max_guests": 2,
                    "base_price": 3200,
                    "status": "available",
                    "housekeeping_status": "clean",
                    "minimum_stay": 1,
                    "base_occupancy": 2,
                    "extra_guest_fee": 500,
                    "amenities": ["WiFi", "Breakfast", "AC", "Smart TV"],
                },
                {
                    "name": "Palm Studio 102",
                    "category": "Standard Room",
                    "description": "Quiet standard room near the courtyard, ideal for solo travelers.",
                    "max_guests": 2,
                    "base_price": 3400,
                    "status": "available",
                    "housekeeping_status": "clean",
                    "minimum_stay": 1,
                    "base_occupancy": 2,
                    "extra_guest_fee": 500,
                    "amenities": ["WiFi", "Courtyard View", "Rain Shower"],
                },
                {
                    "name": "Harbor Deluxe 201",
                    "category": "Deluxe Room",
                    "description": "Larger room with lounge chair, work desk, and partial sea view.",
                    "max_guests": 3,
                    "base_price": 5200,
                    "status": "available",
                    "housekeeping_status": "in_progress",
                    "minimum_stay": 1,
                    "base_occupancy": 2,
                    "extra_guest_fee": 900,
                    "amenities": ["WiFi", "Workspace", "Mini Bar", "Sea View"],
                },
                {
                    "name": "Harbor Deluxe 202",
                    "category": "Deluxe Room",
                    "description": "Premium deluxe inventory frequently booked by families and weekend stays.",
                    "max_guests": 3,
                    "base_price": 5600,
                    "status": "available",
                    "housekeeping_status": "dirty",
                    "minimum_stay": 1,
                    "base_occupancy": 2,
                    "extra_guest_fee": 900,
                    "amenities": ["WiFi", "Balcony", "Mini Bar", "Sofa"],
                },
                {
                    "name": "Skyline Suite 301",
                    "category": "Suite",
                    "description": "Top-floor suite with living area, bathtub, and airport transfer credit.",
                    "max_guests": 4,
                    "base_price": 9800,
                    "status": "available",
                    "housekeeping_status": "clean",
                    "minimum_stay": 2,
                    "base_occupancy": 2,
                    "extra_guest_fee": 1500,
                    "amenities": ["WiFi", "Living Room", "Bathtub", "City View"],
                },
                {
                    "name": "Skyline Suite 302",
                    "category": "Suite",
                    "description": "Signature suite held back for maintenance this week.",
                    "max_guests": 4,
                    "base_price": 11200,
                    "status": "maintenance",
                    "housekeeping_status": "inspecting",
                    "minimum_stay": 2,
                    "base_occupancy": 2,
                    "extra_guest_fee": 1600,
                    "amenities": ["WiFi", "Dining Area", "Butler Pantry"],
                },
            ]

            room_map = {}
            for room in room_defs:
                room_id = _uuid_for(tenant_id, f"room:{room['name']}")
                room_map[room["name"]] = {**room, "id": room_id}
                cur.execute(
                    """
                    INSERT INTO rooms (
                        id, tenant_id, name, description, category_id, max_guests, base_price,
                        status, amenities, images, housekeeping_status, minimum_stay,
                        base_occupancy, extra_guest_fee, check_in_time, check_out_time,
                        cancellation_policy
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s,
                        %s, %s::jsonb, %s::jsonb, %s, %s,
                        %s, %s, '14:00', '11:00',
                        'Free cancellation up to 24 hours before check-in.'
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        description = EXCLUDED.description,
                        category_id = EXCLUDED.category_id,
                        max_guests = EXCLUDED.max_guests,
                        base_price = EXCLUDED.base_price,
                        status = EXCLUDED.status,
                        amenities = EXCLUDED.amenities,
                        images = EXCLUDED.images,
                        housekeeping_status = EXCLUDED.housekeeping_status,
                        minimum_stay = EXCLUDED.minimum_stay,
                        base_occupancy = EXCLUDED.base_occupancy,
                        extra_guest_fee = EXCLUDED.extra_guest_fee,
                        check_in_time = EXCLUDED.check_in_time,
                        check_out_time = EXCLUDED.check_out_time,
                        cancellation_policy = EXCLUDED.cancellation_policy,
                        updated_at = NOW()
                    """,
                    [
                        room_id,
                        tenant_id,
                        room["name"],
                        room["description"],
                        category_ids[room["category"]],
                        room["max_guests"],
                        room["base_price"],
                        room["status"],
                        json.dumps(room["amenities"]),
                        json.dumps([]),
                        room["housekeeping_status"],
                        room["minimum_stay"],
                        room["base_occupancy"],
                        room["extra_guest_fee"],
                    ],
                )

            guest_defs = [
                {
                    "name": "Anaya Mehra",
                    "email": "anaya.mehra@airbee.demo",
                    "phone": "+91 98765 10001",
                    "tags": ["repeat", "direct"],
                    "is_vip": True,
                    "notes": "Prefers quiet rooms and early breakfast.",
                },
                {
                    "name": "Rohan Kulkarni",
                    "email": "rohan.kulkarni@airbee.demo",
                    "phone": "+91 98765 10002",
                    "tags": ["corporate"],
                    "is_vip": False,
                    "notes": "Late-night arrival pattern.",
                },
                {
                    "name": "Maya Dsouza",
                    "email": "maya.dsouza@airbee.demo",
                    "phone": "+91 98765 10003",
                    "tags": ["family"],
                    "is_vip": False,
                    "notes": "Requests extra bedding.",
                },
                {
                    "name": "Kabir Shah",
                    "email": "kabir.shah@airbee.demo",
                    "phone": "+91 98765 10004",
                    "tags": ["high-value", "suite"],
                    "is_vip": True,
                    "notes": "Often books suites for 2-3 nights.",
                },
                {
                    "name": "Elena Roy",
                    "email": "elena.roy@airbee.demo",
                    "phone": "+91 98765 10005",
                    "tags": ["weekend"],
                    "is_vip": False,
                    "notes": "Usually books on weekends.",
                },
            ]

            guest_map = {}
            for guest in guest_defs:
                guest_id = _uuid_for(tenant_id, f"guest:{guest['email']}")
                guest_map[guest["email"]] = {**guest, "id": guest_id}
                cur.execute(
                    """
                    INSERT INTO guest_profiles (id, tenant_id, email, name, phone, tags, is_vip, notes)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        email = EXCLUDED.email,
                        name = EXCLUDED.name,
                        phone = EXCLUDED.phone,
                        tags = EXCLUDED.tags,
                        is_vip = EXCLUDED.is_vip,
                        notes = EXCLUDED.notes,
                        updated_at = NOW()
                    """,
                    [
                        guest_id,
                        tenant_id,
                        guest["email"],
                        guest["name"],
                        guest["phone"],
                        guest["tags"],
                        guest["is_vip"],
                        guest["notes"],
                    ],
                )

            booking_defs = [
                {
                    "key": "stay-anaya-active",
                    "room_name": "Palm Studio 101",
                    "guest_email": "anaya.mehra@airbee.demo",
                    "check_in": today,
                    "check_out": today + timedelta(days=2),
                    "guests": 2,
                    "status": "confirmed",
                    "payment_status": "paid",
                    "amount_paid_ratio": 1.0,
                    "notes": "Direct website booking.",
                },
                {
                    "key": "stay-rohan-pending",
                    "room_name": "Harbor Deluxe 201",
                    "guest_email": "rohan.kulkarni@airbee.demo",
                    "check_in": today + timedelta(days=1),
                    "check_out": today + timedelta(days=3),
                    "guests": 1,
                    "status": "pending",
                    "payment_status": "unpaid",
                    "amount_paid_ratio": 0.0,
                    "notes": "Corporate follow-up pending.",
                },
                {
                    "key": "stay-maya-upcoming",
                    "room_name": "Harbor Deluxe 202",
                    "guest_email": "maya.dsouza@airbee.demo",
                    "check_in": today + timedelta(days=4),
                    "check_out": today + timedelta(days=7),
                    "guests": 3,
                    "status": "confirmed",
                    "payment_status": "partial",
                    "amount_paid_ratio": 0.35,
                    "notes": "Family stay for weekend demand spike.",
                },
                {
                    "key": "stay-kabir-completed",
                    "room_name": "Skyline Suite 301",
                    "guest_email": "kabir.shah@airbee.demo",
                    "check_in": today - timedelta(days=8),
                    "check_out": today - timedelta(days=5),
                    "guests": 2,
                    "status": "completed",
                    "payment_status": "paid",
                    "amount_paid_ratio": 1.0,
                    "notes": "High-value suite guest.",
                },
                {
                    "key": "stay-elena-cancelled",
                    "room_name": "Palm Studio 102",
                    "guest_email": "elena.roy@airbee.demo",
                    "check_in": today + timedelta(days=8),
                    "check_out": today + timedelta(days=10),
                    "guests": 2,
                    "status": "cancelled",
                    "payment_status": "unpaid",
                    "amount_paid_ratio": 0.0,
                    "notes": "Cancelled after rate check.",
                },
                {
                    "key": "stay-anaya-repeat",
                    "room_name": "Palm Studio 102",
                    "guest_email": "anaya.mehra@airbee.demo",
                    "check_in": today - timedelta(days=18),
                    "check_out": today - timedelta(days=16),
                    "guests": 2,
                    "status": "completed",
                    "payment_status": "paid",
                    "amount_paid_ratio": 1.0,
                    "notes": "Repeat direct booking.",
                },
            ]

            for booking in booking_defs:
                booking_id = _uuid_for(tenant_id, f"booking:{booking['key']}")
                room = room_map[booking["room_name"]]
                guest = guest_map[booking["guest_email"]]
                nights = max(1, (booking["check_out"] - booking["check_in"]).days)
                base_amount, tax_amount, service_charge, total_amount = _compute_pricing(
                    room, booking["guests"], nights, tenant
                )
                amount_paid = round(total_amount * booking["amount_paid_ratio"], 2)

                cur.execute(
                    """
                    INSERT INTO bookings (
                        id, tenant_id, room_id, guest_id, guest_name, guest_email, guest_phone,
                        check_in, check_out, guests, total_amount, base_amount, tax_amount,
                        service_charge, status, payment_status, amount_paid, notes
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        room_id = EXCLUDED.room_id,
                        guest_id = EXCLUDED.guest_id,
                        guest_name = EXCLUDED.guest_name,
                        guest_email = EXCLUDED.guest_email,
                        guest_phone = EXCLUDED.guest_phone,
                        check_in = EXCLUDED.check_in,
                        check_out = EXCLUDED.check_out,
                        guests = EXCLUDED.guests,
                        total_amount = EXCLUDED.total_amount,
                        base_amount = EXCLUDED.base_amount,
                        tax_amount = EXCLUDED.tax_amount,
                        service_charge = EXCLUDED.service_charge,
                        status = EXCLUDED.status,
                        payment_status = EXCLUDED.payment_status,
                        amount_paid = EXCLUDED.amount_paid,
                        notes = EXCLUDED.notes,
                        updated_at = NOW()
                    """,
                    [
                        booking_id,
                        tenant_id,
                        room["id"],
                        guest["id"],
                        guest["name"],
                        guest["email"],
                        guest["phone"],
                        booking["check_in"],
                        booking["check_out"],
                        booking["guests"],
                        total_amount,
                        base_amount,
                        tax_amount,
                        service_charge,
                        booking["status"],
                        booking["payment_status"],
                        amount_paid,
                        booking["notes"],
                    ],
                )

        return Response(
            {
                "success": True,
                "summary": {
                    "property_name": tenant["name"],
                    "room_categories": len(category_defs),
                    "rooms": len(room_defs),
                    "guests": len(guest_defs),
                    "bookings": len(booking_defs),
                },
            }
        )
