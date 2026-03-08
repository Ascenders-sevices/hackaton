import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

function shiftMonth(year, month, delta) {
  const monthIdx = month + delta;
  const outYear = year + Math.floor((monthIdx - 1) / 12);
  const outMonth = ((monthIdx - 1) % 12 + 12) % 12 + 1;
  return [outYear, outMonth];
}

// GET /dashboard/stats
router.get("/stats", async (req, res) => {
  const { tenantId } = req;
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const [startYear, startMonth] = shiftMonth(now.getUTCFullYear(), now.getUTCMonth() + 1, -5);
  const startMonthDate = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
  const [nextYear, nextMonth] = shiftMonth(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const nextMonthDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const [roomsRes, bookingsSummaryRes, guestsRes, revenueRes, occupancyRes] = await Promise.all([
    pool.query(
      `SELECT
          COUNT(*)::int AS total_rooms,
          COALESCE(SUM(CASE WHEN housekeeping_status = 'dirty' THEN 1 ELSE 0 END), 0)::int AS dirty_rooms
       FROM rooms
       WHERE tenant_id=$1`,
      [tenantId]
    ),
    pool.query(
      `SELECT
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN 1 ELSE 0 END), 0)::int AS total_bookings,
          COALESCE(
            SUM(
              CASE
                WHEN status = 'confirmed' AND check_in <= $2 AND check_out >= $2 THEN 1
                ELSE 0
              END
            ),
            0
          )::int AS active_bookings,
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0) AS total_revenue,
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
       WHERE tenant_id=$1`,
      [tenantId, today]
    ),
    pool.query("SELECT COUNT(*)::int AS total_guests FROM guest_profiles WHERE tenant_id=$1", [tenantId]),
    pool.query(
      `SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month_key,
          COALESCE(SUM(total_amount), 0) AS revenue
       FROM bookings
       WHERE tenant_id=$1
         AND status != 'cancelled'
         AND created_at >= $2
       GROUP BY 1
       ORDER BY 1`,
      [tenantId, startMonthDate]
    ),
    pool.query(
      `SELECT
          TO_CHAR(DATE_TRUNC('month', check_in), 'YYYY-MM') AS month_key,
          COUNT(*)::int AS booking_count
       FROM bookings
       WHERE tenant_id=$1
         AND status != 'cancelled'
         AND check_in >= $2
         AND check_in < $3
       GROUP BY 1
       ORDER BY 1`,
      [tenantId, startMonthDate, nextMonthDate]
    ),
  ]);

  const totalRooms = Number(roomsRes.rows[0]?.total_rooms || 0);
  const dirtyRooms = Number(roomsRes.rows[0]?.dirty_rooms || 0);
  const totalBookings = Number(bookingsSummaryRes.rows[0]?.total_bookings || 0);
  const activeBookings = Number(bookingsSummaryRes.rows[0]?.active_bookings || 0);
  const totalRevenue = Number(bookingsSummaryRes.rows[0]?.total_revenue || 0);
  const outstandingPayments = Number(bookingsSummaryRes.rows[0]?.outstanding_payments || 0);
  const totalGuests = Number(guestsRes.rows[0]?.total_guests || 0);
  const occupancyRate =
    totalRooms > 0 ? Math.round((activeBookings / totalRooms) * 100) : 0;

  const revenueByMonth = Object.fromEntries(
    revenueRes.rows.map((row) => [row.month_key, Number(row.revenue || 0)])
  );
  const bookingsByMonth = Object.fromEntries(
    occupancyRes.rows.map((row) => [row.month_key, Number(row.booking_count || 0)])
  );

  // Monthly revenue (last 6 months)
  const monthlyRevenue = [];
  const occupancyTrend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const monthStr = d.toISOString().substring(0, 7);
    monthlyRevenue.push({
      month: d.toLocaleString("default", { month: "short" }),
      revenue: revenueByMonth[monthStr] || 0,
    });
    occupancyTrend.push({
      month: d.toLocaleString("default", { month: "short" }),
      occupancy:
        totalRooms > 0
          ? Math.min(100, Math.round(((bookingsByMonth[monthStr] || 0) / totalRooms) * 100))
          : 0,
    });
  }

  res.json({
    stats: {
      occupancyRate,
      totalRooms,
      activeBookings,
      totalBookings,
      totalRevenue,
      outstandingPayments,
      dirtyRooms,
      totalGuests,
    },
    monthlyRevenue,
    occupancyTrend,
  });
});

export default router;
