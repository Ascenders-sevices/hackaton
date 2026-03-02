import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

// GET /rooms
router.get("/", async (req, res) => {
  const { tenantId } = req;
  const { data } = await pool.query(
    `SELECT r.*, rc.name AS category_name, rc.color AS category_color
     FROM rooms r
     LEFT JOIN room_categories rc ON r.category_id = rc.id
     WHERE r.tenant_id = $1
     ORDER BY r.created_at DESC`,
    [tenantId]
  );
  res.json(data.rows);
});

// POST /rooms
router.post("/", async (req, res) => {
  const { tenantId } = req;
  const { name, description, category_id, max_guests, base_price, status } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO rooms (tenant_id, name, description, category_id, max_guests, base_price, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [tenantId, name, description, category_id || null, max_guests || 2, base_price, status || "available"]
  );
  res.status(201).json(rows[0]);
});

// PUT /rooms/:id
router.put("/:id", async (req, res) => {
  const { tenantId } = req;
  const { id } = req.params;
  const { name, description, category_id, max_guests, base_price, status } = req.body;
  const { rows } = await pool.query(
    `UPDATE rooms SET name=$1, description=$2, category_id=$3, max_guests=$4,
     base_price=$5, status=$6 WHERE id=$7 AND tenant_id=$8 RETURNING *`,
    [name, description, category_id || null, max_guests || 2, base_price, status, id, tenantId]
  );
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// DELETE /rooms/:id
router.delete("/:id", async (req, res) => {
  const { tenantId } = req;
  const { id } = req.params;
  await pool.query("DELETE FROM rooms WHERE id=$1 AND tenant_id=$2", [id, tenantId]);
  res.status(204).send();
});

export default router;
