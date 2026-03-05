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
    const { room_id } = await req.json();

    // Fetch room + booking data
    const [roomRes, bookingsRes, allRoomsRes] = await Promise.all([
      room_id
        ? supabase.from("rooms").select("*").eq("id", room_id).single()
        : supabase.from("rooms").select("*").eq("tenant_id", tenantId),
      supabase.from("bookings").select("check_in, check_out, total_amount, status, room_id, guests").eq("tenant_id", tenantId).neq("status", "cancelled").order("check_in", { ascending: false }).limit(100),
      supabase.from("rooms").select("id, name, base_price, max_guests").eq("tenant_id", tenantId),
    ]);

    const rooms = room_id ? [roomRes.data] : (roomRes.data || []);
    const bookings = bookingsRes.data || [];
    const allRooms = allRoomsRes.data || [];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are a dynamic pricing engine for hotels in India. Analyze data and recommend optimal pricing.

ROOMS:
${rooms.map((r: any) => `- ${r.name}: Current Price â‚¹${r.base_price}/night, Max Guests: ${r.max_guests}`).join("\n")}

RECENT BOOKINGS (${bookings.length} total):
${bookings.slice(0, 50).map(b => {
  const room = allRooms.find((r: any) => r.id === b.room_id);
  return `${b.check_in} to ${b.check_out}: â‚¹${b.total_amount}, Room: ${room?.name || "Unknown"}, Guests: ${b.guests}`;
}).join("\n")}

Generate a JSON response with this EXACT structure (no markdown, just JSON):
{
  "pricing_recommendations": [
    ${rooms.map((r: any) => `{
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
  "insights": [
    "Key pricing insight 1",
    "Key pricing insight 2"
  ]
}

Analyze booking frequency, seasonal patterns, and price sensitivity. Return valid JSON only.`;

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
      throw new Error("AI pricing failed");
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "{}";
    
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    
    let pricing;
    try {
      pricing = JSON.parse(jsonStr.trim());
    } catch {
      pricing = { error: "Failed to parse pricing", raw: content };
    }

    return new Response(JSON.stringify(pricing), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-pricing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

