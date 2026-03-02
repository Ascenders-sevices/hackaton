import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

// GET /dashboard/stats
router.get("/stats", async (req, res) => {
  const { tenantId } = req;
  const today = new Date().toISOString().split("T")[0];

  const [roomsRes, bookingsRes, guestsRes] = await Promise.all([
    pool.query("SELECT id, status, housekeeping_status, base_price FROM rooms WHERE tenant_id=$1", [tenantId]),
    pool.query(
      `SELECT id, room_id, check_in, check_out, status, payment_status,
              total_amount, amount_paid, guest_name, created_at
       FROM bookings WHERE tenant_id=$1 ORDER BY created_at DESC`,
      [tenantId]
    ),
    pool.query("SELECT id FROM guest_profiles WHERE tenant_id=$1", [tenantId]),
  ]);

  const rooms = roomsRes.rows;
  const bookings = bookingsRes.rows;
  const guests = guestsRes.rows;

  const activeBookings = bookings.filter(
    (b) => b.status === "confirmed" && b.check_in <= today && b.check_out >= today
  );
  const occupancyRate =
    rooms.length > 0 ? Math.round((activeBookings.length / rooms.length) * 100) : 0;
  const totalRevenue = bookings
    .filter((b) => b.status !== "cancelled")
    .reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const outstandingPayments = bookings
    .filter((b) => b.payment_status !== "paid" && b.status !== "cancelled")
    .reduce((s, b) => s + (Number(b.total_amount || 0) - Number(b.amount_paid || 0)), 0);
  const dirtyRooms = rooms.filter((r) => r.housekeeping_status === "dirty").length;

  // Monthly revenue (last 6 months)
  const monthlyRevenue = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthStr = d.toISOString().substring(0, 7);
    const revenue = bookings
      .filter(
        (b) =>
          b.status !== "cancelled" &&
          b.created_at &&
          b.created_at.toISOString().substring(0, 7) === monthStr
      )
      .reduce((s, b) => s + Number(b.total_amount || 0), 0);
    monthlyRevenue.push({
      month: d.toLocaleString("default", { month: "short" }),
      revenue,
    });
  }

  res.json({
    rooms,
    bookings,
    guests,
    stats: {
      occupancyRate,
      totalRooms: rooms.length,
      activeBookings: activeBookings.length,
      totalRevenue,
      outstandingPayments,
      dirtyRooms,
      totalGuests: guests.length,
    },
    monthlyRevenue,
  });
});

export default router;
