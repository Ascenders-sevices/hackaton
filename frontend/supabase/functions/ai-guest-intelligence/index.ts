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

    const [guestsRes, bookingsRes] = await Promise.all([
      supabase.from("guest_profiles").select("*").eq("tenant_id", tenantId),
      supabase.from("bookings").select("guest_id, guest_name, guest_email, check_in, check_out, total_amount, status, payment_status, guests").eq("tenant_id", tenantId).neq("status", "cancelled"),
    ]);

    const guests = guestsRes.data || [];
    const bookings = bookingsRes.data || [];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are a guest intelligence engine for a hotel. Analyze guest and booking data to provide insights.

GUESTS (${guests.length}):
${guests.slice(0, 50).map((g: any) => `- ${g.name} | ${g.email || 'no email'} | VIP: ${g.is_vip} | Tags: ${(g.tags || []).join(',')}`).join("\n")}

BOOKINGS (${bookings.length}):
${bookings.slice(0, 80).map((b: any) => `- ${b.guest_name}: ${b.check_in} to ${b.check_out}, â‚¹${b.total_amount}, Status: ${b.status}, Payment: ${b.payment_status}`).join("\n")}

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

