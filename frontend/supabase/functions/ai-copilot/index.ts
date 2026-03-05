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

    // Fetch tenant context
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
    if (!profile?.tenant_id) throw new Error("No tenant found");

    const tenantId = profile.tenant_id;

    // Fetch real data for context
    const [roomsRes, bookingsRes, guestsRes, tenantRes] = await Promise.all([
      supabase.from("rooms").select("id, name, base_price, status, housekeeping_status, max_guests").eq("tenant_id", tenantId),
      supabase.from("bookings").select("id, guest_name, check_in, check_out, total_amount, amount_paid, status, payment_status, room_id").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50),
      supabase.from("guest_profiles").select("id, name, email, is_vip, tags").eq("tenant_id", tenantId).limit(50),
      supabase.from("tenants").select("name, currency, gst_enabled, gst_percentage, service_charge_enabled, service_charge_percentage").eq("id", tenantId).single(),
    ]);

    const rooms = roomsRes.data || [];
    const bookings = bookingsRes.data || [];
    const guests = guestsRes.data || [];
    const tenant = tenantRes.data;

    const today = new Date().toISOString().split("T")[0];
    const activeBookings = bookings.filter(b => b.status === "confirmed" && b.check_in <= today && b.check_out >= today);
    const occupancyRate = rooms.length > 0 ? Math.round((activeBookings.length / rooms.length) * 100) : 0;
    const totalRevenue = bookings.filter(b => b.status !== "cancelled").reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const outstandingPayments = bookings.filter(b => b.payment_status !== "paid").reduce((s, b) => s + (Number(b.total_amount || 0) - Number(b.amount_paid || 0)), 0);
    const dirtyRooms = rooms.filter(r => r.housekeeping_status === "dirty").length;

    const systemPrompt = `You are AIR BEE AI Copilot, an intelligent assistant for hotel/resort management. You have access to live property data.

PROPERTY CONTEXT:
- Property: ${tenant?.name || "Unknown"}
- Currency: ${tenant?.currency || "INR"}
- Total Rooms: ${rooms.length}
- Current Occupancy: ${occupancyRate}% (${activeBookings.length}/${rooms.length} rooms occupied)
- Total Revenue (all time): â‚¹${totalRevenue.toLocaleString()}
- Outstanding Payments: â‚¹${outstandingPayments.toLocaleString()}
- Rooms needing cleaning: ${dirtyRooms}
- Total Bookings: ${bookings.length}
- Total Guest Profiles: ${guests.length}
- VIP Guests: ${guests.filter(g => g.is_vip).length}

ROOMS DATA:
${rooms.map(r => `- ${r.name}: â‚¹${r.base_price}/night, Status: ${r.status}, Housekeeping: ${r.housekeeping_status}, Max Guests: ${r.max_guests}`).join("\n")}

RECENT BOOKINGS (last 50):
${bookings.slice(0, 20).map(b => `- ${b.guest_name}: ${b.check_in} to ${b.check_out}, â‚¹${b.total_amount}, Status: ${b.status}, Payment: ${b.payment_status}`).join("\n")}

INSTRUCTIONS:
- Provide actionable insights and recommendations
- When asked about pricing, analyze current rates vs occupancy
- When asked about revenue, calculate projections based on current trends
- When asked about demand, analyze booking patterns
- Be concise but thorough. Use data to back up recommendations.
- Format responses with markdown for readability.
- If asked about forecasting, use booking patterns to predict future demand.`;

    const { messages } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://api.airbee.local/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-copilot error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

