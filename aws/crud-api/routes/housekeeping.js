import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

// GET /housekeeping (returns rooms with housekeeping status)
router.get("/", async (req, res) => {
  const { tenantId } = req;
  const { rows } = await pool.query(
    `SELECT id, name, housekeeping_status, status, category_id
     FROM rooms WHERE tenant_id=$1 ORDER BY name`,
    [tenantId]
  );
  res.json(rows);
});

// PUT /housekeeping/:roomId
router.put("/:roomId", async (req, res) => {
  const { tenantId } = req;
  const { roomId } = req.params;
  const { housekeeping_status } = req.body;
  const validStatuses = ["clean", "dirty", "in_progress", "inspecting"];
  if (!validStatuses.includes(housekeeping_status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const { rows } = await pool.query(
    `UPDATE rooms SET housekeeping_status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING id, name, housekeeping_status`,
    [housekeeping_status, roomId, tenantId]
  );
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

export default router;
