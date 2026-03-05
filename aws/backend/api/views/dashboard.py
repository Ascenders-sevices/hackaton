from datetime import datetime
from decimal import Decimal
from django.db import connection
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response


def _serialize(row, columns):
    obj = dict(zip(columns, row))
    for k, v in obj.items():
        if isinstance(v, Decimal):
            obj[k] = float(v)
        elif hasattr(v, "isoformat"):
            obj[k] = v.isoformat()
    return obj


class DashboardStats(APIView):
    def get(self, request):
        tenant_id = request.user.tenant_id
        today = timezone.now().date()

        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT id, status, housekeeping_status, base_price
                FROM rooms
                WHERE tenant_id = %s
                """,
                [tenant_id],
            )
            room_cols = [c[0] for c in cur.description]
            rooms = [_serialize(r, room_cols) for r in cur.fetchall()]

            cur.execute(
                """
                SELECT id, room_id, check_in, check_out, status, payment_status,
                       total_amount, amount_paid, guest_name, created_at
                FROM bookings
                WHERE tenant_id = %s
                ORDER BY created_at DESC
                """,
                [tenant_id],
            )
            booking_cols = [c[0] for c in cur.description]
            bookings = [_serialize(r, booking_cols) for r in cur.fetchall()]

            cur.execute(
                """
                SELECT id
                FROM guest_profiles
                WHERE tenant_id = %s
                """,
                [tenant_id],
            )
            guest_cols = [c[0] for c in cur.description]
            guests = [_serialize(r, guest_cols) for r in cur.fetchall()]

        active_bookings = [
            b for b in bookings
            if b.get("status") == "confirmed"
            and b.get("check_in")
            and b.get("check_out")
            and b["check_in"] <= today.isoformat()
            and b["check_out"] >= today.isoformat()
        ]

        total_revenue = sum(
            float(b.get("total_amount") or 0)
            for b in bookings
            if b.get("status") != "cancelled"
        )
        outstanding_payments = sum(
            max(
                0.0,
                float(b.get("total_amount") or 0) - float(b.get("amount_paid") or 0),
            )
            for b in bookings
            if b.get("status") != "cancelled" and b.get("payment_status") != "paid"
        )
        dirty_rooms = sum(1 for r in rooms if r.get("housekeeping_status") == "dirty")
        occupancy_rate = round((len(active_bookings) / len(rooms)) * 100) if rooms else 0

        monthly_revenue = []
        for i in range(5, -1, -1):
            month_num = today.month - i
            year_num = today.year
            while month_num <= 0:
                month_num += 12
                year_num -= 1

            month_key = f"{year_num:04d}-{month_num:02d}"
            revenue = sum(
                float(b.get("total_amount") or 0)
                for b in bookings
                if b.get("status") != "cancelled"
                and b.get("created_at")
                and str(b["created_at"])[:7] == month_key
            )
            monthly_revenue.append(
                {
                    "month": datetime(year_num, month_num, 1).strftime("%b"),
                    "revenue": revenue,
                }
            )

        return Response(
            {
                "rooms": rooms,
                "bookings": bookings,
                "guests": guests,
                "stats": {
                    "occupancyRate": occupancy_rate,
                    "totalRooms": len(rooms),
                    "activeBookings": len(active_bookings),
                    "totalRevenue": total_revenue,
                    "outstandingPayments": outstanding_payments,
                    "dirtyRooms": dirty_rooms,
                    "totalGuests": len(guests),
                },
                "monthlyRevenue": monthly_revenue,
            }
        )
