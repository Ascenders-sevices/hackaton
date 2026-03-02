/**
 * AIR BEE — AI Sentiment Analysis Lambda
 * Replaces Supabase edge function ai-sentiment.
 * Uses Amazon Bedrock (Claude 3.5 Haiku).
 *
 * API Gateway route: POST /ai/sentiment
 * Body: { reviews: [{ text, guest_name, date }] }
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

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

    const body = event.body ? JSON.parse(event.body) : {};
    const reviews = body.reviews || [];

    const prompt = `You are a sentiment analysis engine for a hotel. Analyze these guest reviews/feedback and return structured sentiment data.

REVIEWS TO ANALYZE:
${reviews.map((r, i) => `${i + 1}. "${r.text}" - by ${r.guest_name || "Anonymous"} (${r.date || "unknown date"})`).join("\n")}

${reviews.length === 0 ? "No reviews provided. Generate sample analysis with 5 example reviews covering positive, negative, and neutral sentiments about a typical Indian hotel/resort." : ""}

Return ONLY valid JSON:
{
  "reviews_analysis": [
    {"text": "review text", "guest_name": "name", "sentiment": "positive", "score": 0.92, "topics": ["cleanliness", "service"], "flagged_issues": [], "key_phrases": ["excellent service", "clean rooms"]},
    {"text": "review text", "guest_name": "name", "sentiment": "negative", "score": 0.15, "topics": ["noise", "maintenance"], "flagged_issues": ["AC not working"], "key_phrases": ["poor maintenance"]}
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
  "critical_alerts": ["3 reviews mention AC issues - maintenance needed"],
  "improvement_suggestions": ["Address AC maintenance in rooms 203, 305", "Improve breakfast variety"]
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
    console.error("ai-sentiment error:", err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
