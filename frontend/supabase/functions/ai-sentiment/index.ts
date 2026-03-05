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

    const { reviews } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are a sentiment analysis engine for a hotel. Analyze these guest reviews/feedback and return structured sentiment data.

REVIEWS TO ANALYZE:
${(reviews || []).map((r: any, i: number) => `${i+1}. "${r.text}" - by ${r.guest_name || 'Anonymous'} (${r.date || 'unknown date'})`).join("\n")}

${(!reviews || reviews.length === 0) ? "No reviews provided. Generate sample analysis with 5 example reviews covering positive, negative, and neutral sentiments about a typical Indian hotel/resort." : ""}

Return ONLY valid JSON:
{
  "reviews_analysis": [
    {"text": "review text", "guest_name": "name", "sentiment": "positive", "score": 0.92, "topics": ["cleanliness", "service"], "flagged_issues": [], "key_phrases": ["excellent service", "clean rooms"]},
    {"text": "review text", "guest_name": "name", "sentiment": "negative", "score": 0.15, "topics": ["noise", "maintenance"], "flagged_issues": ["AC not working", "noisy neighbors"], "key_phrases": ["poor maintenance"]}
  ],
  "overall_sentiment": {
    "score": 0.72,
    "label": "Mostly Positive",
    "positive_pct": 65,
    "neutral_pct": 20,
    "negative_pct": 15
  },
  "topic_breakdown": [
    {"topic": "Cleanliness", "sentiment_score": 0.85, "mention_count": 12},
    {"topic": "Service", "sentiment_score": 0.78, "mention_count": 10},
    {"topic": "Food", "sentiment_score": 0.65, "mention_count": 8}
  ],
  "critical_alerts": ["3 reviews mention AC issues - maintenance needed", "Noise complaints increased this month"],
  "improvement_suggestions": ["Address AC maintenance in rooms 203, 305", "Improve breakfast variety"]
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

