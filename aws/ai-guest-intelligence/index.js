/**
 * AIR BEE — AI Guest Intelligence Lambda
 * Replaces Supabase edge function ai-guest-intelligence.
 * Uses Amazon Bedrock (Claude 3.5 Haiku).
 *
 * API Gateway route: POST /ai/guest-intelligence
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

    const [guestsRes, bookingsRes] = await Promise.all([
      pool.query("SELECT * FROM guest_profiles WHERE tenant_id=$1 LIMIT 100", [tenantId]),
      pool.query(
        `SELECT guest_id, guest_name, guest_email, check_in, check_out,
                total_amount, status, payment_status, guests
         FROM bookings WHERE tenant_id=$1 AND status != 'cancelled' LIMIT 200`,
        [tenantId]
      ),
    ]);

    const guests = guestsRes.rows;
    const bookings = bookingsRes.rows;

    const prompt = `You are a guest intelligence engine for a hotel. Analyze guest and booking data to provide insights.

GUESTS (${guests.length}):
${guests.slice(0, 50).map((g) => `- ${g.name} | ${g.email || "no email"} | VIP: ${g.is_vip} | Tags: ${(g.tags || []).join(",")}`).join("\n")}

BOOKINGS (${bookings.length}):
${bookings.slice(0, 80).map((b) => `- ${b.guest_name}: ${b.check_in} to ${b.check_out}, ₹${b.total_amount}, Status: ${b.status}, Payment: ${b.payment_status}`).join("\n")}

Return ONLY valid JSON:
{
  "guest_scores": [
    {"name": "Guest Name", "email": "email", "loyalty_score": 85, "lifetime_value": 50000, "total_stays": 5, "avg_spend": 10000, "churn_risk": "low", "preferences": ["late checkout", "sea view"], "segment": "Loyal High-Value"}
  ],
  "segments": [
    {"name": "Loyal High-Value", "count": 5, "avg_ltv": 80000, "description": "Repeat guests with high spending"},
    {"name": "One-Time Visitors", "count": 10, "avg_ltv": 5000, "description": "Single booking guests"},
    {"name": "At-Risk", "count": 3, "avg_ltv": 30000, "description": "Previously loyal but haven't returned"}
  ],
  "insights": ["Your top 20% guests contribute 65% of revenue", "5 guests are at risk of churning"],
  "recommendations": ["Send personalized offers to at-risk guests", "Create a loyalty program tier for frequent visitors"]
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
    console.error("ai-guest-intelligence error:", err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
