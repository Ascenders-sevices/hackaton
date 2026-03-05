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
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
    if (!profile?.tenant_id) throw new Error("No tenant found");

    const tenantId = profile.tenant_id;

    // Fetch historical booking data
    const { data: bookings } = await supabase
      .from("bookings")
      .select("check_in, check_out, total_amount, status, room_id, guests")
      .eq("tenant_id", tenantId)
      .neq("status", "cancelled")
      .order("check_in", { ascending: true });

    const { data: rooms } = await supabase
      .from("rooms")
      .select("id, name, base_price")
      .eq("tenant_id", tenantId);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are an AI demand forecasting engine for a hotel property. Analyze the booking data and generate a forecast.

PROPERTY DATA:
- Total Rooms: ${(rooms || []).length}
- Room Prices: ${(rooms || []).map(r => `${r.name}: â‚¹${r.base_price}`).join(", ")}

HISTORICAL BOOKINGS (${(bookings || []).length} total):
${(bookings || []).slice(-100).map(b => `${b.check_in} to ${b.check_out}: â‚¹${b.total_amount}, ${b.guests} guests`).join("\n")}

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

    const response = await fetch("https://api.airbee.local/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI forecast failed");
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "{}";
    
    // Extract JSON from potential markdown code blocks
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    
    let forecast;
    try {
      forecast = JSON.parse(jsonStr.trim());
    } catch {
      forecast = { error: "Failed to parse forecast", raw: content };
    }

    return new Response(JSON.stringify(forecast), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-forecast error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

