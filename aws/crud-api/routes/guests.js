import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

// GET /guests
router.get("/", async (req, res) => {
  const { tenantId } = req;
  const { rows } = await pool.query(
    "SELECT * FROM guest_profiles WHERE tenant_id=$1 ORDER BY created_at DESC",
    [tenantId]
  );
  res.json(rows);
});

// POST /guests
router.post("/", async (req, res) => {
  const { tenantId } = req;
  const { name, email, phone, notes, is_vip, tags } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO guest_profiles (tenant_id, name, email, phone, notes, is_vip, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [tenantId, name, email || null, phone || null, notes || null, is_vip || false, tags || []]
  );
  res.status(201).json(rows[0]);
});

// PUT /guests/:id
router.put("/:id", async (req, res) => {
  const { tenantId } = req;
  const { id } = req.params;
  const { name, email, phone, notes, is_vip, tags } = req.body;
  const { rows } = await pool.query(
    `UPDATE guest_profiles SET name=$1, email=$2, phone=$3, notes=$4, is_vip=$5, tags=$6
     WHERE id=$7 AND tenant_id=$8 RETURNING *`,
    [name, email || null, phone || null, notes || null, is_vip || false, tags || [], id, tenantId]
  );
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// DELETE /guests/:id
router.delete("/:id", async (req, res) => {
  const { tenantId } = req;
  const { id } = req.params;
  await pool.query("DELETE FROM guest_profiles WHERE id=$1 AND tenant_id=$2", [id, tenantId]);
  res.status(204).send();
});

export default router;
