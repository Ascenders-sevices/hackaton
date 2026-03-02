/**
 * AIR BEE — AI Dynamic Pricing Lambda
 * Replaces Supabase edge function ai-pricing.
 * Uses Amazon Bedrock (Claude 3.5 Haiku).
 *
 * API Gateway route: POST /ai/pricing
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

    const body = event.body ? JSON.parse(event.body) : {};
    const { room_id } = body;

    const [roomsRes, bookingsRes] = await Promise.all([
      room_id
        ? pool.query("SELECT * FROM rooms WHERE id=$1 AND tenant_id=$2", [room_id, tenantId])
        : pool.query("SELECT * FROM rooms WHERE tenant_id=$1", [tenantId]),
      pool.query(
        `SELECT check_in, check_out, total_amount, status, room_id, guests
         FROM bookings WHERE tenant_id=$1 AND status != 'cancelled'
         ORDER BY check_in DESC LIMIT 100`,
        [tenantId]
      ),
    ]);

    const rooms = roomsRes.rows;
    const bookings = bookingsRes.rows;

    const prompt = `You are a dynamic pricing engine for hotels in India. Analyze data and recommend optimal pricing.

ROOMS:
${rooms.map((r) => `- ${r.name}: Current Price ₹${r.base_price}/night, Max Guests: ${r.max_guests}`).join("\n")}

RECENT BOOKINGS (${bookings.length} total):
${bookings.slice(0, 50).map((b) => {
  const room = rooms.find((r) => r.id === b.room_id);
  return `${b.check_in} to ${b.check_out}: ₹${b.total_amount}, Room: ${room?.name || "Unknown"}, Guests: ${b.guests}`;
}).join("\n")}

Generate a JSON response with this EXACT structure (no markdown, just JSON):
{
  "pricing_recommendations": [
    ${rooms.map((r) => `{
      "room_id": "${r.id}",
      "room_name": "${r.name}",
      "current_price": ${r.base_price},
      "recommended_price": 0,
      "change_percentage": 0,
      "reason": "explanation",
      "confidence": 0.8
    }`).join(",\n    ")}
  ],
  "revenue_simulation": {
    "current_monthly_estimate": 0,
    "optimized_monthly_estimate": 0,
    "potential_increase_percentage": 0,
    "assumptions": "Based on current occupancy patterns"
  },
  "pricing_strategy": {
    "weekday_multiplier": 1.0,
    "weekend_multiplier": 1.2,
    "peak_season_multiplier": 1.5,
    "low_season_multiplier": 0.85,
    "last_minute_discount": 0.9
  },
  "insights": ["Key pricing insight 1", "Key pricing insight 2"]
}

Return valid JSON only.`;

    const response = await bedrock.send(
      new InvokeModelCommand({
        modelId: "anthropic.claude-3-5-haiku-20241022-v1:0",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 2048,
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
    console.error("ai-pricing error:", err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
