import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

// GET /bookings
router.get("/", async (req, res) => {
  const { tenantId } = req;
  const { rows } = await pool.query(
    `SELECT b.*, r.name AS room_name, r.base_price AS room_base_price
     FROM bookings b
     LEFT JOIN rooms r ON b.room_id = r.id
     WHERE b.tenant_id = $1
     ORDER BY b.created_at DESC`,
    [tenantId]
  );
  res.json(rows);
});

// POST /bookings
router.post("/", async (req, res) => {
  const { tenantId } = req;
  const {
    room_id, guest_name, guest_email, guest_phone,
    check_in, check_out, guests, total_amount,
    status, payment_status, notes
  } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO bookings
      (tenant_id, room_id, guest_name, guest_email, guest_phone,
       check_in, check_out, guests, total_amount, base_amount,
       status, payment_status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12)
     RETURNING *`,
    [
      tenantId, room_id, guest_name, guest_email || null, guest_phone || null,
      check_in, check_out, guests || 1, total_amount || 0,
      status || "pending", payment_status || "unpaid", notes || null
    ]
  );
  res.status(201).json(rows[0]);
});

// PUT /bookings/:id
router.put("/:id", async (req, res) => {
  const { tenantId } = req;
  const { id } = req.params;
  const { status, payment_status, amount_paid, notes } = req.body;
  const { rows } = await pool.query(
    `UPDATE bookings SET status=$1, payment_status=$2, amount_paid=$3, notes=$4
     WHERE id=$5 AND tenant_id=$6 RETURNING *`,
    [status, payment_status, amount_paid || 0, notes || null, id, tenantId]
  );
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

export default router;
