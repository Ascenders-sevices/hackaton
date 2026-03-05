/**
 * AIR BEE â€” AI Forecast Lambda
 * Replaces Supabase edge function ai-forecast.
 * Uses Amazon Bedrock (Claude 3.5 Haiku) for AIR BEE Bedrock integration.
 *
 * API Gateway route: POST /ai/forecast
 * Env vars: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, BEDROCK_REGION
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

const bedrock = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || "us-east-1",
});

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
    if (!tenantId) return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: "No tenant" }) };

    const [bookingsRes, roomsRes] = await Promise.all([
      pool.query(
        `SELECT check_in, check_out, total_amount, status, room_id, guests
         FROM bookings WHERE tenant_id=$1 AND status != 'cancelled' ORDER BY check_in`,
        [tenantId]
      ),
      pool.query("SELECT id, name, base_price FROM rooms WHERE tenant_id=$1", [tenantId]),
    ]);

    const bookings = bookingsRes.rows;
    const rooms = roomsRes.rows;

    const prompt = `You are an AI demand forecasting engine for a hotel property. Analyze the booking data and generate a forecast.

PROPERTY DATA:
- Total Rooms: ${rooms.length}
- Room Prices: ${rooms.map((r) => `${r.name}: â‚¹${r.base_price}`).join(", ")}

HISTORICAL BOOKINGS (${bookings.length} total):
${bookings.slice(-100).map((b) => `${b.check_in} to ${b.check_out}: â‚¹${b.total_amount}, ${b.guests} guests`).join("\n")}

Generate a JSON response with this EXACT structure (no markdown, just JSON):
{
  "monthly_forecast": [
    {"month": "2026-03", "predicted_occupancy": 65, "predicted_revenue": 150000, "confidence": 0.8},
    {"month": "2026-04", "predicted_occupancy": 72, "predicted_revenue": 180000, "confidence": 0.75},
    {"month": "2026-05", "predicted_occupancy": 80, "predicted_revenue": 220000, "confidence": 0.7},
    {"month": "2026-06", "predicted_occupancy": 85, "predicted_revenue": 250000, "confidence": 0.65},
    {"month": "2026-07", "predicted_occupancy": 78, "predicted_revenue": 200000, "confidence": 0.6},
    {"month": "2026-08", "predicted_occupancy": 70, "predicted_revenue": 170000, "confidence": 0.55}
  ],
  "demand_signals": [
    {"signal": "Weekend demand is 30% higher than weekdays", "impact": "high"},
    {"signal": "Holiday season approaching - expect surge", "impact": "high"}
  ],
  "recommendations": [
    "Consider raising weekend rates by 15-20%",
    "Prepare additional staff for peak season"
  ],
  "seasonal_patterns": {
    "peak_months": ["April", "May", "December"],
    "low_months": ["July", "August", "September"],
    "avg_stay_duration": 2.5
  }
}

Base predictions on actual data patterns. If insufficient data, use reasonable defaults for Indian hospitality market. Always return valid JSON only.`;

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
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    let forecast;
    try { forecast = JSON.parse(jsonStr.trim()); }
    catch { forecast = { error: "Failed to parse forecast", raw: content }; }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(forecast) };
  } catch (err) {
    console.error("ai-forecast error:", err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};

