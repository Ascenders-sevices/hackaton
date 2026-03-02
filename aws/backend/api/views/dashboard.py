import uuid
from decimal import Decimal
from django.db import connection
from rest_framework.views import APIView
from rest_framework.response import Response


class DashboardStats(APIView):
    def get(self, request):
        tenant_id = request.user.tenant_id
        with connection.cursor() as cur:
            # Rooms summary
            cur.execute(
                """
                SELECT
                    COUNT(*) AS total_rooms,
                    COUNT(*) FILTER (WHERE status = 'occupied') AS occupied,
                    COUNT(*) FILTER (WHERE status = 'available') AS available,
                    COUNT(*) FILTER (WHERE status = 'maintenance') AS maintenance
                FROM rooms WHERE tenant_id = %s
                """,
                [tenant_id],
            )
            room_stats = dict(zip([c[0] for c in cur.description], cur.fetchone()))

            # Bookings summary
            cur.execute(
                """
                SELECT
                    COUNT(*) AS total_bookings,
                    COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
                    COUNT(*) FILTER (WHERE status = 'checked_in') AS checked_in,
                    COUNT(*) FILTER (WHERE check_in = CURRENT_DATE) AS arrivals_today,
                    COUNT(*) FILTER (WHERE check_out = CURRENT_DATE) AS departures_today,
                    COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0) AS total_revenue
                FROM bookings WHERE tenant_id = %s
                """,
                [tenant_id],
            )
            booking_stats = dict(zip([c[0] for c in cur.description], cur.fetchone()))

            # Guests
            cur.execute(
                "SELECT COUNT(*) AS total_guests FROM guest_profiles WHERE tenant_id = %s",
                [tenant_id],
            )
            guest_stats = dict(zip([c[0] for c in cur.description], cur.fetchone()))

            # Monthly revenue (last 6 months)
            cur.execute(
                """
                SELECT
                    TO_CHAR(DATE_TRUNC('month', check_in), 'Mon YYYY') AS month,
                    COALESCE(SUM(total_amount), 0) AS revenue
                FROM bookings
                WHERE tenant_id = %s
                  AND check_in >= NOW() - INTERVAL '6 months'
                  AND payment_status = 'paid'
                GROUP BY DATE_TRUNC('month', check_in)
                ORDER BY DATE_TRUNC('month', check_in)
                """,
                [tenant_id],
            )
            monthly_revenue = [
                {"month": row[0], "revenue": float(row[1])}
                for row in cur.fetchall()
            ]

        occupancy = 0
        if room_stats["total_rooms"]:
            occupancy = round(room_stats["occupied"] / room_stats["total_rooms"] * 100)

        return Response(
            {
                "rooms": {**room_stats, "occupancy_rate": occupancy},
                "bookings": {
                    **booking_stats,
                    "total_revenue": float(booking_stats["total_revenue"]),
                },
                "guests": guest_stats,
                "monthly_revenue": monthly_revenue,
            }
        )
