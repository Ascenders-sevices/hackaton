/**
 * AIR BEE — AI Daily Briefing Lambda
 * Replaces Supabase edge function ai-briefing.
 * Uses Amazon Bedrock (Claude 3.5 Haiku).
 *
 * API Gateway route: POST /ai/briefing
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

const bedrock = new BedrockRuntimeClient({ region: process.env.BEDROCK_REGION || "us-east-1" });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Content-Type": "application/json",
};

export const handler = async (event) => {
  if (event.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }
  try {
    const claims = event.requestContext?.authorizer?.jwt?.claims;
    if (!claims?.sub) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: "Unauthorized" }) };
    const tenantId = claims["custom:tenant_id"];
    const userSub = claims.sub;

    const today = new Date().toISOString().split("T")[0];
    const [roomsRes, bookingsRes, dirtyRes, paymentsRes, tenantRes, profileRes] = await Promise.all([
      pool.query("SELECT id, name, status, base_price FROM rooms WHERE tenant_id=$1", [tenantId]),
      pool.query(
        `SELECT id, guest_name, check_in, check_out, total_amount, amount_paid, status, payment_status
         FROM bookings WHERE tenant_id=$1 ORDER BY check_in DESC LIMIT 50`,
        [tenantId]
      ),
      pool.query("SELECT id FROM rooms WHERE tenant_id=$1 AND housekeeping_status='dirty'", [tenantId]),
      pool.query(
        "SELECT total_amount, amount_paid FROM bookings WHERE tenant_id=$1 AND payment_status IN ('unpaid','partial')",
        [tenantId]
      ),
      pool.query("SELECT name FROM tenants WHERE id=$1", [tenantId]),
      pool.query("SELECT full_name FROM profiles WHERE id=$1", [userSub]),
    ]);

    const rooms = roomsRes.rows;
    const bookings = bookingsRes.rows;
    const activeBookings = bookings.filter(
      (b) => b.status === "confirmed" && b.check_in <= today && b.check_out >= today
    );
    const occupancy = rooms.length > 0 ? Math.round((activeBookings.length / rooms.length) * 100) : 0;
    const outstanding = paymentsRes.rows.reduce(
      (s, b) => s + (Number(b.total_amount || 0) - Number(b.amount_paid || 0)),
      0
    );
    const todayArrivals = bookings.filter((b) => b.check_in === today && b.status === "confirmed");
    const todayDepartures = bookings.filter((b) => b.check_out === today);
    const managerName = profileRes.rows[0]?.full_name || "Manager";
    const propertyName = tenantRes.rows[0]?.name || "the property";

    const prompt = `You are an AI hotel manager. Generate a daily briefing for ${managerName} at ${propertyName}.

TODAY'S DATA (${today}):
- Occupancy: ${occupancy}% (${activeBookings.length}/${rooms.length})
- Arrivals today: ${todayArrivals.length} (${todayArrivals.map((b) => b.guest_name).join(", ") || "None"})
- Departures today: ${todayDepartures.length}
- Dirty rooms: ${dirtyRes.rows.length}
- Outstanding payments: ₹${outstanding.toLocaleString()}
- Pending bookings: ${bookings.filter((b) => b.status === "pending").length}

RECENT BOOKINGS:
${bookings.slice(0, 15).map((b) => `${b.guest_name}: ${b.check_in}→${b.check_out} ₹${b.total_amount} [${b.status}/${b.payment_status}]`).join("\n")}

Generate a concise, actionable daily briefing. Return ONLY valid JSON:
{
  "greeting": "Good morning, ${managerName}! Here's your daily briefing for ${today}.",
  "key_metrics": {"occupancy": 65, "arrivals": 3, "departures": 2, "revenue_today": 15000},
  "priority_actions": [
    {"priority": "high", "action": "Collect outstanding payments from 3 guests", "category": "payments"},
    {"priority": "medium", "action": "Prepare rooms for arrivals today", "category": "operations"}
  ],
  "opportunities": ["Weekend approaching - consider last-minute rate promotion"],
  "risks": ["2 unpaid bookings for this week"],
  "forecast_note": "Based on current trends, expect 75% occupancy this weekend."
}`;

    const response = await bedrock.send(
      new InvokeModelCommand({
        modelId: "anthropic.claude-3-5-haiku-20241022-v1:0",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }],
        }),
      })
    );

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const content = responseBody.content[0].text;
    let jsonStr = content;
    const m = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) jsonStr = m[1];
    let result;
    try { result = JSON.parse(jsonStr.trim()); }
    catch { result = { error: "Parse failed", raw: content }; }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(result) };
  } catch (err) {
    console.error("ai-briefing error:", err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
