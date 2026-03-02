/**
 * AIR BEE — AI Copilot Lambda (Streaming)
 * Replaces Supabase edge function ai-copilot.
 * Uses Amazon Bedrock with InvokeModelWithResponseStream for SSE streaming.
 *
 * API Gateway route: POST /ai/copilot
 * Lambda must have "Response Streaming" enabled via Function URL or HTTP API.
 *
 * For simplest deployment, this function returns a complete response (non-streaming).
 * The frontend AICopilot page will be updated to handle both streaming and non-streaming.
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

    const body = event.body ? JSON.parse(event.body) : {};
    const messages = body.messages || [];

    // Fetch live property context
    const [roomsRes, bookingsRes, guestsRes, tenantRes] = await Promise.all([
      pool.query(
        "SELECT id, name, base_price, status, housekeeping_status, max_guests FROM rooms WHERE tenant_id=$1",
        [tenantId]
      ),
      pool.query(
        `SELECT id, guest_name, check_in, check_out, total_amount, amount_paid, status, payment_status, room_id
         FROM bookings WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [tenantId]
      ),
      pool.query("SELECT id, name, email, is_vip, tags FROM guest_profiles WHERE tenant_id=$1 LIMIT 50", [tenantId]),
      pool.query("SELECT name, currency, gst_enabled, gst_percentage FROM tenants WHERE id=$1", [tenantId]),
    ]);

    const rooms = roomsRes.rows;
    const bookings = bookingsRes.rows;
    const guests = guestsRes.rows;
    const tenant = tenantRes.rows[0];

    const today = new Date().toISOString().split("T")[0];
    const activeBookings = bookings.filter(
      (b) => b.status === "confirmed" && b.check_in <= today && b.check_out >= today
    );
    const occupancyRate = rooms.length > 0 ? Math.round((activeBookings.length / rooms.length) * 100) : 0;
    const totalRevenue = bookings
      .filter((b) => b.status !== "cancelled")
      .reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const outstandingPayments = bookings
      .filter((b) => b.payment_status !== "paid")
      .reduce((s, b) => s + (Number(b.total_amount || 0) - Number(b.amount_paid || 0)), 0);
    const dirtyRooms = rooms.filter((r) => r.housekeeping_status === "dirty").length;

    const systemPrompt = `You are AIR BEE AI Copilot, an intelligent assistant for hotel/resort management powered by Amazon Bedrock. You have access to live property data.

PROPERTY CONTEXT:
- Property: ${tenant?.name || "Unknown"}
- Currency: ${tenant?.currency || "INR"}
- Total Rooms: ${rooms.length}
- Current Occupancy: ${occupancyRate}% (${activeBookings.length}/${rooms.length} rooms occupied)
- Total Revenue (all time): ₹${totalRevenue.toLocaleString()}
- Outstanding Payments: ₹${outstandingPayments.toLocaleString()}
- Rooms needing cleaning: ${dirtyRooms}
- Total Bookings: ${bookings.length}
- Total Guest Profiles: ${guests.length}
- VIP Guests: ${guests.filter((g) => g.is_vip).length}

ROOMS DATA:
${rooms.map((r) => `- ${r.name}: ₹${r.base_price}/night, Status: ${r.status}, Housekeeping: ${r.housekeeping_status}, Max Guests: ${r.max_guests}`).join("\n")}

RECENT BOOKINGS (last 50):
${bookings.slice(0, 20).map((b) => `- ${b.guest_name}: ${b.check_in} to ${b.check_out}, ₹${b.total_amount}, Status: ${b.status}, Payment: ${b.payment_status}`).join("\n")}

INSTRUCTIONS:
- Provide actionable insights and recommendations
- When asked about pricing, analyze current rates vs occupancy
- When asked about revenue, calculate projections based on current trends
- Be concise but thorough. Use data to back up recommendations.
- Format responses with markdown for readability.`;

    const response = await bedrock.send(
      new InvokeModelCommand({
        modelId: "anthropic.claude-3-5-haiku-20241022-v1:0",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 2048,
          system: systemPrompt,
          messages: messages.length > 0 ? messages : [{ role: "user", content: "Hello! Give me a quick overview of my property." }],
        }),
      })
    );

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const aiContent = responseBody.content[0].text;

    // Return in OpenAI-compatible format so frontend works with minimal changes
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        choices: [{ message: { role: "assistant", content: aiContent } }],
      }),
    };
  } catch (err) {
    console.error("ai-copilot error:", err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
