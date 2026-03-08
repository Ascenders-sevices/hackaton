from datetime import date, datetime

from django.db import connection
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    month_idx = month + delta
    out_year = year + (month_idx - 1) // 12
    out_month = ((month_idx - 1) % 12) + 1
    return out_year, out_month


def _month_start(year: int, month: int) -> date:
    return date(year, month, 1)


class DashboardStats(APIView):
    def get(self, request):
        tenant_id = request.user.tenant_id
        today = timezone.now().date()
        start_year, start_month = _shift_month(today.year, today.month, -5)
        start_month_date = _month_start(start_year, start_month)
        next_month_year, next_month = _shift_month(today.year, today.month, 1)
        next_month_date = _month_start(next_month_year, next_month)

        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) AS total_rooms,
                    COALESCE(SUM(CASE WHEN housekeeping_status = 'dirty' THEN 1 ELSE 0 END), 0) AS dirty_rooms
                FROM rooms
                WHERE tenant_id = %s
                """,
                [tenant_id],
            )
            room_row = cur.fetchone() or (0, 0)
            total_rooms = int(room_row[0] or 0)
            dirty_rooms = int(room_row[1] or 0)

            cur.execute(
                """
                SELECT
                    COALESCE(SUM(CASE WHEN status != 'cancelled' THEN 1 ELSE 0 END), 0) AS total_bookings,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN status = 'confirmed'
                                 AND check_in <= %s
                                 AND check_out >= %s
                                THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS active_bookings,
                    COALESCE(
                        SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END),
                        0
                    ) AS total_revenue,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN status != 'cancelled' AND payment_status != 'paid'
                                THEN GREATEST(total_amount - COALESCE(amount_paid, 0), 0)
                                ELSE 0
                            END
                        ),
                        0
                    ) AS outstanding_payments
                FROM bookings
                WHERE tenant_id = %s
                """,
                [today, today, tenant_id],
            )
            booking_row = cur.fetchone() or (0, 0, 0, 0)
            total_bookings = int(booking_row[0] or 0)
            active_bookings = int(booking_row[1] or 0)
            total_revenue = float(booking_row[2] or 0)
            outstanding_payments = float(booking_row[3] or 0)

            cur.execute(
                """
                SELECT COUNT(*)
                FROM guest_profiles
                WHERE tenant_id = %s
                """,
                [tenant_id],
            )
            total_guests = int((cur.fetchone() or [0])[0] or 0)

            cur.execute(
                """
                SELECT
                    TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month_key,
                    COALESCE(SUM(total_amount), 0) AS revenue
                FROM bookings
                WHERE tenant_id = %s
                  AND status != 'cancelled'
                  AND created_at >= %s
                GROUP BY 1
                ORDER BY 1
                """,
                [tenant_id, start_month_date],
            )
            monthly_revenue_rows = {
                row[0]: float(row[1] or 0)
                for row in cur.fetchall()
                if row and row[0]
            }

            cur.execute(
                """
                SELECT
                    TO_CHAR(DATE_TRUNC('month', check_in), 'YYYY-MM') AS month_key,
                    COUNT(*) AS booking_count
                FROM bookings
                WHERE tenant_id = %s
                  AND status != 'cancelled'
                  AND check_in >= %s
                  AND check_in < %s
                GROUP BY 1
                ORDER BY 1
                """,
                [tenant_id, start_month_date, next_month_date],
            )
            occupancy_rows = {
                row[0]: int(row[1] or 0)
                for row in cur.fetchall()
                if row and row[0]
            }

        occupancy_rate = round((active_bookings / total_rooms) * 100) if total_rooms else 0
        monthly_revenue = []
        occupancy_trend = []
        for i in range(5, -1, -1):
            year_num, month_num = _shift_month(today.year, today.month, -i)
            month_key = f"{year_num:04d}-{month_num:02d}"
            label = datetime(year_num, month_num, 1).strftime("%b")
            monthly_revenue.append(
                {
                    "month": label,
                    "revenue": monthly_revenue_rows.get(month_key, 0.0),
                }
            )
            occupancy_trend.append(
                {
                    "month": label,
                    "occupancy": (
                        min(100, round((occupancy_rows.get(month_key, 0) / total_rooms) * 100))
                        if total_rooms
                        else 0
                    ),
                }
            )

        return Response(
            {
                "stats": {
                    "occupancyRate": occupancy_rate,
                    "totalRooms": total_rooms,
                    "activeBookings": active_bookings,
                    "totalBookings": total_bookings,
                    "totalRevenue": total_revenue,
                    "outstandingPayments": outstanding_payments,
                    "dirtyRooms": dirty_rooms,
                    "totalGuests": total_guests,
                },
                "monthlyRevenue": monthly_revenue,
                "occupancyTrend": occupancy_trend,
            }
        )
