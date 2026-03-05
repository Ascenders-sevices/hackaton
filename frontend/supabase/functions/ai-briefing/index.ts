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
    const { data: profile } = await supabase.from("profiles").select("tenant_id, full_name").eq("id", user.id).single();
    if (!profile?.tenant_id) throw new Error("No tenant");
    const tenantId = profile.tenant_id;

    const today = new Date().toISOString().split("T")[0];
    const [roomsRes, bookingsRes, dirtyRes, paymentsRes, tenantRes] = await Promise.all([
      supabase.from("rooms").select("id, name, status, base_price").eq("tenant_id", tenantId),
      supabase.from("bookings").select("id, guest_name, check_in, check_out, total_amount, amount_paid, status, payment_status").eq("tenant_id", tenantId).order("check_in", { ascending: false }).limit(50),
      supabase.from("rooms").select("id").eq("tenant_id", tenantId).eq("housekeeping_status", "dirty"),
      supabase.from("bookings").select("total_amount, amount_paid").eq("tenant_id", tenantId).in("payment_status", ["unpaid", "partial"]),
      supabase.from("tenants").select("name").eq("id", tenantId).single(),
    ]);

    const rooms = roomsRes.data || [];
    const bookings = bookingsRes.data || [];
    const activeBookings = bookings.filter(b => b.status === "confirmed" && b.check_in <= today && b.check_out >= today);
    const occupancy = rooms.length > 0 ? Math.round((activeBookings.length / rooms.length) * 100) : 0;
    const outstanding = (paymentsRes.data || []).reduce((s: number, b: any) => s + (Number(b.total_amount || 0) - Number(b.amount_paid || 0)), 0);
    const todayArrivals = bookings.filter(b => b.check_in === today && b.status === "confirmed");
    const todayDepartures = bookings.filter(b => b.check_out === today);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are an AI hotel manager. Generate a daily briefing for ${profile.full_name || 'the manager'} at ${tenantRes.data?.name || 'the property'}.

TODAY'S DATA (${today}):
- Occupancy: ${occupancy}% (${activeBookings.length}/${rooms.length})
- Arrivals today: ${todayArrivals.length} (${todayArrivals.map((b: any) => b.guest_name).join(", ") || "None"})
- Departures today: ${todayDepartures.length}
- Dirty rooms: ${(dirtyRes.data || []).length}
- Outstanding payments: â‚¹${outstanding.toLocaleString()}
- Pending bookings: ${bookings.filter(b => b.status === "pending").length}

RECENT BOOKINGS:
${bookings.slice(0, 15).map((b: any) => `${b.guest_name}: ${b.check_in}â†’${b.check_out} â‚¹${b.total_amount} [${b.status}/${b.payment_status}]`).join("\n")}

Generate a concise, actionable daily briefing. Return ONLY valid JSON:
{
  "greeting": "Good morning, [Name]! Here's your daily briefing for [date].",
  "key_metrics": {"occupancy": 65, "arrivals": 3, "departures": 2, "revenue_today": 15000},
  "priority_actions": [
    {"priority": "high", "action": "Collect â‚¹25,000 outstanding from 3 guests", "category": "payments"},
    {"priority": "medium", "action": "Prepare rooms for 3 arrivals today", "category": "operations"}
  ],
  "opportunities": ["Weekend approaching - consider last-minute rate promotion", "VIP guest arriving tomorrow - prepare welcome amenities"],
  "risks": ["2 unpaid bookings for this week", "Room 101 maintenance overdue"],
  "forecast_note": "Based on current trends, expect 75% occupancy this weekend. Consider raising weekend rates by 10%."
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

