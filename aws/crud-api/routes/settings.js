import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

// GET /settings (tenant config + profile)
router.get("/", async (req, res) => {
  const { tenantId, userSub } = req;
  const [tenantRes, profileRes, categoriesRes] = await Promise.all([
    pool.query("SELECT * FROM tenants WHERE id=$1", [tenantId]),
    pool.query("SELECT * FROM profiles WHERE id=$1", [userSub]),
    pool.query("SELECT * FROM room_categories WHERE tenant_id=$1 ORDER BY display_order", [tenantId]),
  ]);
  res.json({
    tenant: tenantRes.rows[0] || null,
    profile: profileRes.rows[0] || null,
    room_categories: categoriesRes.rows,
  });
});

// PUT /settings (update tenant)
router.put("/", async (req, res) => {
  const { tenantId } = req;
  const {
    name, contact_email, contact_phone, address, currency, timezone,
    gst_enabled, gst_percentage, gst_number,
    service_charge_enabled, service_charge_percentage,
  } = req.body;
  const { rows } = await pool.query(
    `UPDATE tenants SET
       name=$1, contact_email=$2, contact_phone=$3, address=$4,
       currency=$5, timezone=$6, gst_enabled=$7, gst_percentage=$8,
       gst_number=$9, service_charge_enabled=$10, service_charge_percentage=$11
     WHERE id=$12 RETURNING *`,
    [
      name, contact_email || null, contact_phone || null, address || null,
      currency || "INR", timezone || "Asia/Kolkata",
      gst_enabled || false, gst_percentage || 0,
      gst_number || null, service_charge_enabled || false, service_charge_percentage || 0,
      tenantId,
    ]
  );
  res.json(rows[0]);
});

// GET /settings/room-categories
router.get("/room-categories", async (req, res) => {
  const { tenantId } = req;
  const { rows } = await pool.query(
    "SELECT * FROM room_categories WHERE tenant_id=$1 ORDER BY display_order",
    [tenantId]
  );
  res.json(rows);
});

export default router;
