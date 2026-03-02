/**
 * AIR BEE — AI Booking Risk Lambda
 * Replaces Supabase edge function ai-booking-risk.
 * Uses Amazon Bedrock (Claude 3.5 Haiku).
 *
 * API Gateway route: POST /ai/booking-risk
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

    const [bookingsRes, roomsRes] = await Promise.all([
      pool.query(
        `SELECT id, guest_name, guest_email, guest_phone, check_in, check_out,
                total_amount, amount_paid, status, payment_status, room_id, guests, notes
         FROM bookings WHERE tenant_id=$1 AND status IN ('pending','confirmed')
         ORDER BY check_in`,
        [tenantId]
      ),
      pool.query("SELECT id, name, max_guests FROM rooms WHERE tenant_id=$1", [tenantId]),
    ]);

    const bookings = bookingsRes.rows;
    const rooms = roomsRes.rows;

    const prompt = `You are a booking risk prediction engine for a hotel. Analyze upcoming bookings and predict risks.

ROOMS: ${rooms.map((r) => `${r.name} (max ${r.max_guests})`).join(", ")}

UPCOMING BOOKINGS (${bookings.length}):
${bookings.slice(0, 60).map((b) => {
  const room = rooms.find((r) => r.id === b.room_id);
  return `- ${b.guest_name} | ${b.check_in} to ${b.check_out} | Room: ${room?.name || "Unknown"} | ₹${b.total_amount} | Paid: ₹${b.amount_paid} | Status: ${b.status} | Payment: ${b.payment_status} | Phone: ${b.guest_phone ? "Yes" : "No"} | Email: ${b.guest_email ? "Yes" : "No"}`;
}).join("\n")}

Analyze factors: payment status, contact info completeness, lead time, booking patterns.

Return ONLY valid JSON:
{
  "booking_risks": [
    {
      "booking_id": "id",
      "guest_name": "name",
      "check_in": "date",
      "room_name": "room",
      "risk_level": "high",
      "no_show_probability": 0.35,
      "cancellation_probability": 0.25,
      "risk_factors": ["No payment received", "No phone number"],
      "recommended_action": "Contact guest to confirm and collect deposit"
    }
  ],
  "overbooking_alerts": [
    {"date": "2026-03-15", "rooms_booked": 5, "total_rooms": 4, "risk": "Potential overbooking"}
  ],
  "summary": {
    "total_upcoming": 10,
    "high_risk": 2,
    "medium_risk": 3,
    "low_risk": 5,
    "estimated_no_show_rate": 12,
    "total_revenue_at_risk": 25000
  },
  "recommendations": ["Implement 50% advance payment policy", "Send confirmation SMS 24h before check-in"]
}`;

    const response = await bedrock.send(
      new InvokeModelCommand({
        modelId: "anthropic.claude-3-5-haiku-20241022-v1:0",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 3000,
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
    console.error("ai-booking-risk error:", err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
