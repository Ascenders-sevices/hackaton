import json
import os
import uuid
from decimal import Decimal
from django.conf import settings
from django.db import connection
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import boto3


def _invoke(prompt, max_tokens=2048):
    """Call OpenAI locally (LOCAL_DEV) or Bedrock on AWS."""
    openai_key = os.environ.get("OPENAI_API_KEY", "")

    if getattr(settings, "LOCAL_DEV", False) and openai_key:
        # ── OpenAI (local dev) ───────────────────────────────────
        from openai import OpenAI
        client = OpenAI(api_key=openai_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content
    else:
        # ── Amazon Bedrock (AWS deployment) ─────────────────────
        client = boto3.client("bedrock-runtime", region_name=settings.BEDROCK_REGION)
        resp = client.invoke_model(
            modelId="anthropic.claude-3-5-haiku-20241022-v1:0",
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
            }),
        )
        return json.loads(resp["body"].read())["content"][0]["text"]


def _serialize_row(row, columns):
    obj = dict(zip(columns, row))
    for k, v in obj.items():
        if isinstance(v, uuid.UUID):
            obj[k] = str(v)
        elif isinstance(v, Decimal):
            obj[k] = float(v)
        elif hasattr(v, "isoformat"):
            obj[k] = v.isoformat()
    return obj


def _get_context(tenant_id):
    """Fetch live property data for AI context."""
    with connection.cursor() as cur:
        cur.execute(
            "SELECT name, city, country, currency FROM tenants WHERE id = %s",
            [tenant_id],
        )
        cols = [c[0] for c in cur.description]
        row = cur.fetchone()
        tenant = dict(zip(cols, row)) if row else {}

        cur.execute(
            """
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE status='occupied') AS occupied,
                   COUNT(*) FILTER (WHERE status='available') AS available,
                   ROUND(AVG(base_price)::numeric,2) AS avg_price
            FROM rooms WHERE tenant_id = %s
            """,
            [tenant_id],
        )
        cols = [c[0] for c in cur.description]
        row = cur.fetchone()
        rooms = dict(zip(cols, row)) if row else {}
        rooms = {k: float(v) if isinstance(v, Decimal) else v for k, v in rooms.items()}

        cur.execute(
            """
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE status='confirmed') AS confirmed,
                   COUNT(*) FILTER (WHERE status='checked_in') AS checked_in,
                   COALESCE(SUM(total_amount) FILTER (WHERE payment_status='paid'),0) AS revenue
            FROM bookings WHERE tenant_id = %s
            """,
            [tenant_id],
        )
        cols = [c[0] for c in cur.description]
        row = cur.fetchone()
        bookings = dict(zip(cols, row)) if row else {}
        bookings = {k: float(v) if isinstance(v, Decimal) else v for k, v in bookings.items()}

        cur.execute(
            "SELECT COUNT(*) AS total FROM guest_profiles WHERE tenant_id = %s",
            [tenant_id],
        )
        guest_count = cur.fetchone()[0]

    return {"tenant": tenant, "rooms": rooms, "bookings": bookings, "guest_count": guest_count}


# ─── Copilot ──────────────────────────────────────────────────────────────────

class CopilotView(APIView):
    def post(self, request):
        tenant_id = request.user.tenant_id
        messages = request.data.get("messages", [])
        ctx = _get_context(tenant_id)

        system = (
            f"You are an AI hotel management assistant for {ctx['tenant'].get('name', 'this property')} "
            f"in {ctx['tenant'].get('city', '')}.\n"
            f"Current stats: {json.dumps(ctx)}\n"
            "Answer concisely and helpfully. If asked for data, refer to the stats above."
        )

        last_user_msg = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"), ""
        )
        prompt = f"{system}\n\nUser: {last_user_msg}"
        text = _invoke(prompt, max_tokens=1024)
        return Response(
            {
                "choices": [
                    {"message": {"role": "assistant", "content": text}, "finish_reason": "stop"}
                ]
            }
        )


# ─── Forecast ─────────────────────────────────────────────────────────────────

class ForecastView(APIView):
    def post(self, request):
        tenant_id = request.user.tenant_id
        ctx = _get_context(tenant_id)

        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT TO_CHAR(check_in,'Mon YYYY') AS month,
                       COUNT(*) AS bookings,
                       COALESCE(SUM(total_amount),0) AS revenue
                FROM bookings
                WHERE tenant_id = %s AND check_in >= NOW() - INTERVAL '6 months'
                GROUP BY DATE_TRUNC('month', check_in), TO_CHAR(check_in,'Mon YYYY')
                ORDER BY DATE_TRUNC('month', check_in)
                """,
                [tenant_id],
            )
            historical = [
                {"month": r[0], "bookings": r[1], "revenue": float(r[2])}
                for r in cur.fetchall()
            ]

        prompt = (
            f"Hotel: {ctx['tenant'].get('name')} | Rooms: {ctx['rooms'].get('total')} | "
            f"Avg price: {ctx['rooms'].get('avg_price')}\n"
            f"Historical data (last 6 months): {json.dumps(historical)}\n\n"
            "Generate a 6-month forecast. Return ONLY valid JSON:\n"
            '{"forecast":[{"month":"Apr 2025","occupancy":72,"revenue":45000,"bookings":58},...], '
            '"insights":["insight1","insight2","insight3"],'
            '"recommendations":["rec1","rec2"]}'
        )
        raw = _invoke(prompt, max_tokens=2048)
        try:
            start = raw.find("{")
            end = raw.rfind("}") + 1
            data = json.loads(raw[start:end])
        except Exception:
            data = {"forecast": [], "insights": [raw], "recommendations": []}
        return Response(data)


# ─── Pricing ──────────────────────────────────────────────────────────────────

class PricingView(APIView):
    def post(self, request):
        tenant_id = request.user.tenant_id
        ctx = _get_context(tenant_id)

        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT r.id, r.name, r.room_number, r.base_price, r.current_price,
                       rc.name AS category,
                       COUNT(b.id) AS recent_bookings
                FROM rooms r
                LEFT JOIN room_categories rc ON r.category_id = rc.id
                LEFT JOIN bookings b ON b.room_id = r.id
                    AND b.check_in >= NOW() - INTERVAL '30 days'
                WHERE r.tenant_id = %s
                GROUP BY r.id, rc.name
                """,
                [tenant_id],
            )
            cols = [c[0] for c in cur.description]
            rooms_data = [_serialize_row(r, cols) for r in cur.fetchall()]

        prompt = (
            f"Hotel: {ctx['tenant'].get('name')} | Occupancy: {ctx['rooms'].get('occupied')}/{ctx['rooms'].get('total')} rooms\n"
            f"Rooms data: {json.dumps(rooms_data)}\n\n"
            "Provide dynamic pricing recommendations. Return ONLY valid JSON:\n"
            '{"recommendations":[{"room_id":"uuid","room_name":"name","current_price":100,"recommended_price":120,"reason":"...","confidence":0.85}],'
            '"strategy":"overall pricing strategy summary",'
            '"revenue_simulation":{"current_monthly":5000,"optimized_monthly":6200,"increase_percent":24}}'
        )
        raw = _invoke(prompt, max_tokens=2048)
        try:
            start = raw.find("{")
            end = raw.rfind("}") + 1
            data = json.loads(raw[start:end])
        except Exception:
            data = {"recommendations": [], "strategy": raw, "revenue_simulation": {}}
        return Response(data)


# ─── Guest Intelligence ───────────────────────────────────────────────────────

class GuestIntelligenceView(APIView):
    def post(self, request):
        tenant_id = request.user.tenant_id

        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT gp.id, gp.full_name, gp.email, gp.loyalty_tier,
                       gp.total_stays, gp.total_spent, gp.nationality,
                       COUNT(b.id) AS recent_bookings,
                       MAX(b.check_out) AS last_stay
                FROM guest_profiles gp
                LEFT JOIN bookings b ON b.guest_profile_id = gp.id AND b.tenant_id = %s
                WHERE gp.tenant_id = %s
                GROUP BY gp.id
                ORDER BY gp.total_spent DESC NULLS LAST
                LIMIT 50
                """,
                [tenant_id, tenant_id],
            )
            cols = [c[0] for c in cur.description]
            guests_data = [_serialize_row(r, cols) for r in cur.fetchall()]

        prompt = (
            f"Guest data for hotel ({len(guests_data)} guests): {json.dumps(guests_data)}\n\n"
            "Analyze guests and provide intelligence. Return ONLY valid JSON:\n"
            '{"segments":[{"name":"VIP","count":5,"avg_spend":2000,"characteristics":"..."}],'
            '"top_guests":[{"id":"uuid","name":"...","loyalty_score":95,"churn_risk":"low","recommendation":"..."}],'
            '"insights":["insight1","insight2"],'
            '"retention_strategies":["strategy1","strategy2"]}'
        )
        raw = _invoke(prompt, max_tokens=2048)
        try:
            start = raw.find("{")
            end = raw.rfind("}") + 1
            data = json.loads(raw[start:end])
        except Exception:
            data = {"segments": [], "top_guests": [], "insights": [raw], "retention_strategies": []}
        return Response(data)


# ─── Sentiment Analysis ───────────────────────────────────────────────────────

class SentimentView(APIView):
    def post(self, request):
        reviews = request.data.get("reviews", [])
        if not reviews:
            return Response({"error": "No reviews provided"}, status=status.HTTP_400_BAD_REQUEST)

        prompt = (
            f"Analyze these hotel reviews: {json.dumps(reviews)}\n\n"
            "Return ONLY valid JSON:\n"
            '{"overall_sentiment":"positive","overall_score":4.2,'
            '"summary":"Overall guests are satisfied...",'
            '"categories":{"cleanliness":4.5,"service":4.0,"location":4.8,"value":3.9},'
            '"strengths":["strength1","strength2"],'
            '"improvements":["area1","area2"],'
            '"review_breakdown":{"positive":15,"neutral":3,"negative":2}}'
        )
        raw = _invoke(prompt, max_tokens=2048)
        try:
            start = raw.find("{")
            end = raw.rfind("}") + 1
            data = json.loads(raw[start:end])
        except Exception:
            data = {"summary": raw, "overall_sentiment": "unknown"}
        return Response(data)


# ─── Booking Risk ─────────────────────────────────────────────────────────────

class BookingRiskView(APIView):
    def post(self, request):
        tenant_id = request.user.tenant_id

        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT b.id, b.check_in, b.check_out, b.status, b.payment_status,
                       b.total_amount, b.adults, b.special_requests,
                       gp.full_name AS guest_name, gp.loyalty_tier, gp.total_stays,
                       EXTRACT(DAY FROM check_in - NOW()) AS days_until_checkin
                FROM bookings b
                LEFT JOIN guest_profiles gp ON b.guest_profile_id = gp.id
                WHERE b.tenant_id = %s
                  AND b.status IN ('confirmed','pending')
                  AND b.check_in >= NOW()
                ORDER BY b.check_in
                LIMIT 30
                """,
                [tenant_id],
            )
            cols = [c[0] for c in cur.description]
            upcoming = [_serialize_row(r, cols) for r in cur.fetchall()]

        prompt = (
            f"Upcoming bookings ({len(upcoming)}): {json.dumps(upcoming)}\n\n"
            "Assess no-show and cancellation risk. Return ONLY valid JSON:\n"
            '{"high_risk":[{"booking_id":"uuid","guest_name":"...","check_in":"date","risk_score":0.82,"risk_factors":["..."],"recommended_action":"..."}],'
            '"summary":{"high_risk_count":3,"medium_risk_count":5,"low_risk_count":22,'
            '"estimated_revenue_at_risk":4500},'
            '"strategies":["strategy1","strategy2"]}'
        )
        raw = _invoke(prompt, max_tokens=2048)
        try:
            start = raw.find("{")
            end = raw.rfind("}") + 1
            data = json.loads(raw[start:end])
        except Exception:
            data = {"high_risk": [], "summary": {}, "strategies": [raw]}
        return Response(data)


# ─── Daily Briefing ───────────────────────────────────────────────────────────

class BriefingView(APIView):
    def post(self, request):
        tenant_id = request.user.tenant_id
        ctx = _get_context(tenant_id)

        prompt = (
            f"You are the AI assistant for {ctx['tenant'].get('name', 'this hotel')}.\n"
            f"Today's property data: {json.dumps(ctx)}\n\n"
            "Write a concise daily manager briefing (3-5 sentences) covering: "
            "current occupancy, today's arrivals/departures, revenue performance, "
            "and 1-2 actionable recommendations."
        )
        text = _invoke(prompt, max_tokens=512)
        return Response({"briefing": text})
