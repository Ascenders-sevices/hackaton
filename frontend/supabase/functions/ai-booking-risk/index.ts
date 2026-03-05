import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
    if (!profile?.tenant_id) throw new Error("No tenant");
    const tenantId = profile.tenant_id;

    const [bookingsRes, roomsRes] = await Promise.all([
      supabase.from("bookings").select("id, guest_name, guest_email, guest_phone, check_in, check_out, total_amount, amount_paid, status, payment_status, room_id, guests, notes").eq("tenant_id", tenantId).in("status", ["pending", "confirmed"]).order("check_in"),
      supabase.from("rooms").select("id, name, max_guests").eq("tenant_id", tenantId),
    ]);

    const bookings = bookingsRes.data || [];
    const rooms = roomsRes.data || [];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are a booking risk prediction engine for a hotel. Analyze upcoming bookings and predict risks.

ROOMS: ${rooms.map((r: any) => `${r.name} (max ${r.max_guests})`).join(", ")}

UPCOMING BOOKINGS (${bookings.length}):
${bookings.slice(0, 60).map((b: any) => {
  const room = rooms.find((r: any) => r.id === b.room_id);
  return `- ${b.guest_name} | ${b.check_in} to ${b.check_out} | Room: ${room?.name || 'Unknown'} | â‚¹${b.total_amount} | Paid: â‚¹${b.amount_paid} | Status: ${b.status} | Payment: ${b.payment_status} | Phone: ${b.guest_phone ? 'Yes' : 'No'} | Email: ${b.guest_email ? 'Yes' : 'No'}`;
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

    const response = await fetch("https://api.airbee.local/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "user", content: prompt }], stream: false }),
    });
    if (!response.ok) throw new Error("AI failed");
    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "{}";
    let jsonStr = content;
    const m = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) jsonStr = m[1];
    let result;
    try { result = JSON.parse(jsonStr.trim()); } catch { result = { error: "Parse failed", raw: content }; }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

