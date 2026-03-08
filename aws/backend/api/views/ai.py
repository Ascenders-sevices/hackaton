import json
import os
import re
import uuid
from datetime import datetime
from decimal import Decimal

import boto3
from django.conf import settings
from django.db import connection
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView


_BEDROCK_CLIENT = None


def _is_marketplace_billing_error(exc):
    text = str(exc)
    return (
        "INVALID_PAYMENT_INSTRUMENT" in text
        or "AWS Marketplace subscription" in text
        or "Model access is denied" in text
    )


def _invoke_anthropic(client, model_id, prompt, max_tokens):
    resp = client.invoke_model(
        modelId=model_id,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(
            {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
            }
        ),
    )
    return json.loads(resp["body"].read())["content"][0]["text"]


def _invoke_nova(client, model_id, prompt, max_tokens):
    resp = client.invoke_model(
        modelId=model_id,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(
            {
                "schemaVersion": "messages-v1",
                "messages": [{"role": "user", "content": [{"text": prompt}]}],
                "inferenceConfig": {"maxTokens": max_tokens, "temperature": 0.2},
            }
        ),
    )
    body = json.loads(resp["body"].read())
    content = body.get("output", {}).get("message", {}).get("content", [])
    for item in content:
        if isinstance(item, dict) and item.get("text"):
            return item["text"]
    raise RuntimeError("Nova response did not include text output")


def _invoke(prompt, max_tokens=2048):
    """Call OpenAI in LOCAL_DEV or Bedrock in AWS."""
    openai_key = os.environ.get("OPENAI_API_KEY", "")

    if getattr(settings, "LOCAL_DEV", False) and openai_key:
        from openai import OpenAI

        client = OpenAI(api_key=openai_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content

    bedrock_model_id = os.environ.get(
        "BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0"
    )
    fallback_model_id = os.environ.get(
        "BEDROCK_FALLBACK_MODEL_ID", "apac.amazon.nova-lite-v1:0"
    )
    client = _get_bedrock_client()
    try:
        return _invoke_anthropic(client, bedrock_model_id, prompt, max_tokens)
    except Exception as exc:
        if _is_marketplace_billing_error(exc):
            try:
                print(
                    "Primary Bedrock model blocked; retrying with fallback model "
                    f"{fallback_model_id}. Error: {exc}"
                )
                return _invoke_nova(client, fallback_model_id, prompt, max_tokens)
            except Exception as fallback_exc:
                print(
                    "Fallback Bedrock model also failed. "
                    f"Primary={exc} | Fallback={fallback_exc}"
                )
                return (
                    "AI is temporarily unavailable because the primary Anthropic model "
                    "is blocked for this AWS account and the fallback model could not be used."
                )

        print(f"Bedrock invocation failed: {exc}")
        return "AI is temporarily unavailable. Please try again shortly."


def _get_bedrock_client():
    global _BEDROCK_CLIENT
    if _BEDROCK_CLIENT is None:
        _BEDROCK_CLIENT = boto3.client(
            "bedrock-runtime", region_name=settings.BEDROCK_REGION
        )
    return _BEDROCK_CLIENT


def _serialize_row(row, columns):
    obj = dict(zip(columns, row))
    for key, value in obj.items():
        if isinstance(value, uuid.UUID):
            obj[key] = str(value)
        elif isinstance(value, Decimal):
            obj[key] = float(value)
        elif hasattr(value, "isoformat"):
            obj[key] = value.isoformat()
    return obj


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return default


def _pick_fields(record, fields):
    item = {}
    for field in fields:
        value = record.get(field)
        if value is None or value == "":
            continue
        if isinstance(value, str) and len(value) > 160:
            value = value[:157] + "..."
        item[field] = value
    return item


def _count_by(records, field):
    counts = {}
    for record in records:
        key = record.get(field) or "unknown"
        counts[key] = counts.get(key, 0) + 1
    return counts


def _build_trend_series(bookings):
    today = timezone.now().date()
    bookings_by_month = {}
    revenue_by_month = {}

    for booking in bookings:
        if booking.get("status") == "cancelled":
            continue

        check_in = booking.get("check_in")
        if check_in:
            bookings_by_month[str(check_in)[:7]] = bookings_by_month.get(
                str(check_in)[:7], 0
            ) + 1

        created_at = booking.get("created_at")
        if created_at:
            month_key = str(created_at)[:7]
            revenue_by_month[month_key] = revenue_by_month.get(month_key, 0.0) + _safe_float(
                booking.get("total_amount")
            )

    booking_series = []
    revenue_series = []
    for i in range(5, -1, -1):
        year_num, month_num = _month_shift(today.year, today.month, -i)
        month_key = f"{year_num:04d}-{month_num:02d}"
        booking_series.append(
            {"month": month_key, "bookings": bookings_by_month.get(month_key, 0)}
        )
        revenue_series.append(
            {"month": month_key, "revenue": round(revenue_by_month.get(month_key, 0.0), 2)}
        )

    return {
        "bookings_by_month": booking_series,
        "revenue_by_month": revenue_series,
    }


def _build_ai_context(
    snapshot,
    *,
    booking_limit=20,
    room_limit=20,
    guest_limit=20,
    booking_fields=None,
    room_fields=None,
    guest_fields=None,
):
    bookings = snapshot.get("bookings", [])
    rooms = snapshot.get("rooms", [])
    guests = snapshot.get("guests", [])
    stats = snapshot.get("stats", {})

    booking_fields = booking_fields or [
        "id",
        "guest_name",
        "check_in",
        "check_out",
        "total_amount",
        "status",
        "payment_status",
        "room_id",
        "guests",
    ]
    room_fields = room_fields or [
        "id",
        "name",
        "base_price",
        "status",
        "housekeeping_status",
        "max_guests",
    ]

    available_rooms = sum(1 for room in rooms if room.get("status") == "available")
    avg_room_rate = (
        round(sum(_safe_float(room.get("base_price")) for room in rooms) / len(rooms), 2)
        if rooms
        else 0.0
    )
    non_cancelled_bookings = [
        booking for booking in bookings if booking.get("status") != "cancelled"
    ]
    avg_booking_value = (
        round(
            sum(_safe_float(booking.get("total_amount")) for booking in non_cancelled_bookings)
            / len(non_cancelled_bookings),
            2,
        )
        if non_cancelled_bookings
        else 0.0
    )

    context = {
        "tenant": {
            "name": snapshot.get("tenant", {}).get("name", "Unknown"),
            "currency": snapshot.get("tenant", {}).get("currency", "INR"),
            "gst_enabled": bool(snapshot.get("tenant", {}).get("gst_enabled")),
            "gst_percentage": _safe_float(
                snapshot.get("tenant", {}).get("gst_percentage")
            ),
        },
        "stats": stats,
        "room_summary": {
            "total": len(rooms),
            "available": available_rooms,
            "dirty": stats.get("dirty_rooms", 0),
            "average_base_price": avg_room_rate,
            "status_mix": _count_by(rooms, "status"),
        },
        "booking_summary": {
            "total": len(bookings),
            "active": stats.get("active_bookings", 0),
            "average_booking_value": avg_booking_value,
            "status_mix": _count_by(bookings, "status"),
            "payment_mix": _count_by(bookings, "payment_status"),
        },
        "trend_summary": _build_trend_series(bookings),
        "sample_rooms": [_pick_fields(room, room_fields) for room in rooms[:room_limit]],
        "sample_bookings": [
            _pick_fields(booking, booking_fields) for booking in bookings[:booking_limit]
        ],
    }

    if guest_fields:
        context["guest_summary"] = {
            "total": len(guests),
            "vip_count": sum(1 for guest in guests if guest.get("is_vip")),
        }
        context["sample_guests"] = [
            _pick_fields(guest, guest_fields) for guest in guests[:guest_limit]
        ]

    return json.dumps(context, separators=(",", ":"))


def _extract_json(raw_text):
    if not isinstance(raw_text, str):
        return None

    text = raw_text.strip()
    if not text:
        return None

    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fenced:
        text = fenced.group(1).strip()

    try:
        return json.loads(text)
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except Exception:
            return None
    return None


def _month_shift(year, month, delta):
    month_idx = month + delta
    out_year = year + (month_idx - 1) // 12
    out_month = ((month_idx - 1) % 12) + 1
    return out_year, out_month


def _fetch_property_data(tenant_id):
    today_iso = timezone.now().date().isoformat()

    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, currency, gst_enabled, gst_percentage
            FROM tenants
            WHERE id = %s
            """,
            [tenant_id],
        )
        tenant_row = cur.fetchone()
        tenant_cols = [c[0] for c in cur.description]
        tenant = _serialize_row(tenant_row, tenant_cols) if tenant_row else {}

        cur.execute(
            """
            SELECT id, name, base_price, status, housekeeping_status, max_guests
            FROM rooms
            WHERE tenant_id = %s
            ORDER BY created_at DESC
            """,
            [tenant_id],
        )
        room_cols = [c[0] for c in cur.description]
        rooms = [_serialize_row(r, room_cols) for r in cur.fetchall()]

        cur.execute(
            """
            SELECT id, guest_id, guest_name, guest_email, guest_phone,
                   check_in, check_out, total_amount, amount_paid, status, payment_status,
                   room_id, guests, notes, created_at
            FROM bookings
            WHERE tenant_id = %s
            ORDER BY created_at DESC
            LIMIT 300
            """,
            [tenant_id],
        )
        booking_cols = [c[0] for c in cur.description]
        bookings = [_serialize_row(r, booking_cols) for r in cur.fetchall()]

        cur.execute(
            """
            SELECT id, name, email, is_vip, tags, notes
            FROM guest_profiles
            WHERE tenant_id = %s
            ORDER BY created_at DESC
            LIMIT 200
            """,
            [tenant_id],
        )
        guest_cols = [c[0] for c in cur.description]
        guests = [_serialize_row(r, guest_cols) for r in cur.fetchall()]

    active_bookings = [
        b
        for b in bookings
        if b.get("status") == "confirmed"
        and b.get("check_in")
        and b.get("check_out")
        and b["check_in"] <= today_iso
        and b["check_out"] >= today_iso
    ]
    occupancy_rate = round((len(active_bookings) / len(rooms)) * 100) if rooms else 0
    total_revenue = sum(
        _safe_float(b.get("total_amount")) for b in bookings if b.get("status") != "cancelled"
    )
    outstanding_payments = sum(
        max(
            0.0,
            _safe_float(b.get("total_amount")) - _safe_float(b.get("amount_paid")),
        )
        for b in bookings
        if b.get("status") != "cancelled" and b.get("payment_status") != "paid"
    )
    dirty_rooms = sum(1 for r in rooms if r.get("housekeeping_status") == "dirty")

    stats = {
        "total_rooms": len(rooms),
        "active_bookings": len(active_bookings),
        "occupancy_rate": occupancy_rate,
        "total_revenue": total_revenue,
        "outstanding_payments": outstanding_payments,
        "dirty_rooms": dirty_rooms,
        "guest_count": len(guests),
    }

    return {
        "tenant": tenant,
        "rooms": rooms,
        "bookings": bookings,
        "guests": guests,
        "stats": stats,
    }


class CopilotView(APIView):
    def post(self, request):
        tenant_id = request.user.tenant_id
        messages = request.data.get("messages", [])
        snapshot = _fetch_property_data(tenant_id)
        stats = snapshot["stats"]
        context = _build_ai_context(
            snapshot,
            booking_limit=12,
            room_limit=15,
        )

        last_user_msg = next(
            (m.get("content", "") for m in reversed(messages) if m.get("role") == "user"),
            "",
        )

        prompt = (
            "You are AIR BEE AI Copilot for hotel management. "
            "Provide concise, actionable answers with concrete numbers when possible.\n"
            "Use the hotel snapshot below as source data.\n\n"
            f"Snapshot: {context}\n\n"
            f"User question: {last_user_msg or 'Give me an overview.'}"
        )
        text = _invoke(prompt, max_tokens=900)
        return Response(
            {
                "choices": [
                    {"message": {"role": "assistant", "content": text}, "finish_reason": "stop"}
                ]
            }
        )


class ForecastView(APIView):
    def post(self, request):
        tenant_id = request.user.tenant_id
        snapshot = _fetch_property_data(tenant_id)
        bookings = snapshot["bookings"]
        rooms = snapshot["rooms"]
        stats = snapshot["stats"]
        context = _build_ai_context(
            snapshot,
            booking_limit=80,
            room_limit=25,
        )

        prompt = (
            "You are an AI demand forecasting engine for a hotel in India.\n"
            "Use the compact hotel snapshot below to estimate future occupancy and revenue.\n"
            f"Snapshot: {context}\n\n"
            "Return ONLY valid JSON with keys: monthly_forecast, demand_signals, recommendations, seasonal_patterns. "
            "Use monthly_forecast items with month, predicted_occupancy, predicted_revenue, confidence."
        )

        raw = _invoke(prompt, max_tokens=1800)
        parsed = _extract_json(raw) or {}

        monthly = parsed.get("monthly_forecast")
        if not isinstance(monthly, list) or not monthly:
            today = timezone.now().date()
            avg_monthly_revenue = 0.0
            if bookings:
                buckets = {}
                for b in bookings:
                    created_at = b.get("created_at")
                    if not created_at:
                        continue
                    key = str(created_at)[:7]
                    buckets[key] = buckets.get(key, 0.0) + _safe_float(b.get("total_amount"))
                if buckets:
                    avg_monthly_revenue = sum(buckets.values()) / len(buckets)

            base_occ = stats["occupancy_rate"] or 55
            pattern = [0, 4, 8, 10, 6, 2]
            monthly = []
            for i in range(6):
                year_num, month_num = _month_shift(today.year, today.month, i)
                occ = max(35, min(95, base_occ + pattern[i]))
                monthly.append(
                    {
                        "month": f"{year_num:04d}-{month_num:02d}",
                        "predicted_occupancy": occ,
                        "predicted_revenue": round(avg_monthly_revenue * (occ / max(base_occ, 1)), 2),
                        "confidence": round(max(0.5, 0.85 - (i * 0.05)), 2),
                    }
                )

        result = {
            "monthly_forecast": monthly,
            "demand_signals": parsed.get("demand_signals")
            if isinstance(parsed.get("demand_signals"), list)
            else [
                {"signal": "Weekend demand is generally higher than weekdays", "impact": "high"},
                {"signal": "Advance booking pace drives occupancy lift", "impact": "medium"},
            ],
            "recommendations": parsed.get("recommendations")
            if isinstance(parsed.get("recommendations"), list)
            else [
                "Increase rates for peak-demand weekends.",
                "Use targeted promotions in low-demand periods.",
            ],
            "seasonal_patterns": parsed.get("seasonal_patterns")
            if isinstance(parsed.get("seasonal_patterns"), dict)
            else {
                "peak_months": ["Apr", "May", "Dec"],
                "low_months": ["Jul", "Aug", "Sep"],
                "avg_stay_duration": 2.0,
            },
        }
        return Response(result)


class PricingView(APIView):
    def post(self, request):
        tenant_id = request.user.tenant_id
        room_id = request.data.get("room_id")
        snapshot = _fetch_property_data(tenant_id)
        rooms = snapshot["rooms"]
        bookings = snapshot["bookings"]
        stats = snapshot["stats"]

        if room_id:
            rooms = [r for r in rooms if r.get("id") == room_id]
            snapshot = {**snapshot, "rooms": rooms}

        context = _build_ai_context(
            snapshot,
            booking_limit=60,
            room_limit=max(len(rooms), 1),
        )

        prompt = (
            "You are a dynamic pricing engine for hotels in India.\n"
            "Use the compact hotel snapshot below to recommend pricing changes.\n"
            f"Snapshot: {context}\n"
            f"Current occupancy rate: {stats['occupancy_rate']}\n\n"
            "Return ONLY valid JSON with keys: pricing_recommendations, revenue_simulation, pricing_strategy, insights."
        )

        raw = _invoke(prompt, max_tokens=1800)
        parsed = _extract_json(raw) or {}

        recs = parsed.get("pricing_recommendations")
        if not isinstance(recs, list) or not recs:
            recs = []
            for r in rooms:
                current_price = _safe_float(r.get("base_price"))
                if stats["occupancy_rate"] >= 75:
                    recommended = current_price * 1.12
                    reason = "High occupancy supports a rate increase."
                elif stats["occupancy_rate"] <= 45:
                    recommended = current_price * 0.92
                    reason = "Lower occupancy suggests a tactical discount."
                else:
                    recommended = current_price * 1.03
                    reason = "Stable demand supports a moderate increase."
                change = (
                    round(((recommended - current_price) / current_price) * 100, 2)
                    if current_price
                    else 0.0
                )
                recs.append(
                    {
                        "room_id": r.get("id"),
                        "room_name": r.get("name"),
                        "current_price": round(current_price, 2),
                        "recommended_price": round(recommended, 2),
                        "change_percentage": change,
                        "reason": reason,
                        "confidence": 0.72,
                    }
                )

        current_monthly = sum(
            _safe_float(b.get("total_amount"))
            for b in bookings
            if b.get("status") != "cancelled"
            and b.get("created_at")
            and str(b["created_at"])[:7] == timezone.now().date().isoformat()[:7]
        )
        avg_change = 0.0
        if recs:
            avg_change = sum(_safe_float(r.get("change_percentage")) for r in recs) / len(recs)
        optimized_monthly = current_monthly * (1 + (avg_change / 100.0))

        revenue_sim = parsed.get("revenue_simulation")
        if not isinstance(revenue_sim, dict):
            revenue_sim = {
                "current_monthly_estimate": round(current_monthly, 2),
                "optimized_monthly_estimate": round(optimized_monthly, 2),
                "potential_increase_percentage": round(max(avg_change, 0.0), 2),
                "assumptions": "Estimate based on current occupancy and recommended room-level pricing changes.",
            }

        pricing_strategy = parsed.get("pricing_strategy")
        if not isinstance(pricing_strategy, dict):
            pricing_strategy = {
                "weekday_multiplier": 1.0,
                "weekend_multiplier": 1.15,
                "peak_season_multiplier": 1.3,
                "low_season_multiplier": 0.9,
                "last_minute_discount": 0.92,
            }

        insights = parsed.get("insights")
        if not isinstance(insights, list):
            insights = [
                "Maintain tighter pricing control for high-demand windows.",
                "Monitor pickup pace daily to adjust rates faster.",
            ]

        return Response(
            {
                "pricing_recommendations": recs,
                "revenue_simulation": revenue_sim,
                "pricing_strategy": pricing_strategy,
                "insights": insights,
            }
        )


class GuestIntelligenceView(APIView):
    def post(self, request):
        tenant_id = request.user.tenant_id
        snapshot = _fetch_property_data(tenant_id)
        guests = snapshot["guests"]
        bookings = [b for b in snapshot["bookings"] if b.get("status") != "cancelled"]
        context = _build_ai_context(
            {**snapshot, "bookings": bookings},
            booking_limit=80,
            room_limit=15,
            guest_limit=80,
            booking_fields=[
                "guest_name",
                "guest_email",
                "check_in",
                "check_out",
                "total_amount",
                "status",
            ],
            guest_fields=["name", "email", "is_vip", "tags", "notes"],
        )

        prompt = (
            "You are a guest intelligence engine for a hotel.\n"
            f"Snapshot: {context}\n\n"
            "Return ONLY valid JSON with keys: guest_scores, segments, insights, recommendations."
        )

        raw = _invoke(prompt, max_tokens=1800)
        parsed = _extract_json(raw) or {}

        guest_scores = parsed.get("guest_scores")
        if not isinstance(guest_scores, list) or not guest_scores:
            by_guest = {}
            for b in bookings:
                key = b.get("guest_email") or b.get("guest_name") or "Unknown"
                item = by_guest.setdefault(
                    key,
                    {
                        "name": b.get("guest_name") or "Guest",
                        "email": b.get("guest_email") or "",
                        "lifetime_value": 0.0,
                        "total_stays": 0,
                        "last_checkout": b.get("check_out"),
                    },
                )
                item["lifetime_value"] += _safe_float(b.get("total_amount"))
                item["total_stays"] += 1
                if b.get("check_out") and (
                    not item["last_checkout"] or b["check_out"] > item["last_checkout"]
                ):
                    item["last_checkout"] = b["check_out"]

            guest_scores = []
            for g in by_guest.values():
                avg_spend = g["lifetime_value"] / max(g["total_stays"], 1)
                loyalty_score = int(min(99, (g["total_stays"] * 10) + (avg_spend / 1500)))
                churn_risk = "low"
                if g["total_stays"] <= 1:
                    churn_risk = "high"
                elif g["total_stays"] <= 2:
                    churn_risk = "medium"
                segment = "Loyal High-Value" if loyalty_score >= 70 else "Standard"
                guest_scores.append(
                    {
                        "name": g["name"],
                        "email": g["email"],
                        "loyalty_score": loyalty_score,
                        "lifetime_value": round(g["lifetime_value"], 2),
                        "total_stays": g["total_stays"],
                        "avg_spend": round(avg_spend, 2),
                        "churn_risk": churn_risk,
                        "preferences": [],
                        "segment": segment,
                    }
                )
            guest_scores = sorted(guest_scores, key=lambda x: x["lifetime_value"], reverse=True)[:20]

        segments = parsed.get("segments")
        if not isinstance(segments, list):
            segment_counts = {}
            for g in guest_scores:
                name = g.get("segment") or "Standard"
                segment_counts.setdefault(name, {"name": name, "count": 0, "avg_ltv": 0.0})
                segment_counts[name]["count"] += 1
                segment_counts[name]["avg_ltv"] += _safe_float(g.get("lifetime_value"))
            segments = []
            for seg in segment_counts.values():
                avg_ltv = seg["avg_ltv"] / max(seg["count"], 1)
                segments.append(
                    {
                        "name": seg["name"],
                        "count": seg["count"],
                        "avg_ltv": round(avg_ltv, 2),
                        "description": "Auto-generated segment",
                    }
                )

        insights = parsed.get("insights")
        if not isinstance(insights, list):
            insights = [
                "A small set of repeat guests is driving most revenue.",
                "Guests with one stay need targeted retention offers.",
            ]

        recommendations = parsed.get("recommendations")
        if not isinstance(recommendations, list):
            recommendations = [
                "Create targeted offers for medium/high churn-risk guests.",
                "Reward top-value repeat guests with loyalty perks.",
            ]

        return Response(
            {
                "guest_scores": guest_scores,
                "segments": segments,
                "insights": insights,
                "recommendations": recommendations,
            }
        )


class SentimentView(APIView):
    def post(self, request):
        reviews = request.data.get("reviews", [])
        if not isinstance(reviews, list):
            reviews = []

        if not reviews:
            reviews = [
                {"text": "Great stay, friendly staff and clean rooms.", "guest_name": "Anita", "date": "2026-03-01"},
                {"text": "Check-in took too long but room was good.", "guest_name": "Ravi", "date": "2026-03-02"},
                {"text": "AC was noisy and breakfast was average.", "guest_name": "Nisha", "date": "2026-03-03"},
                {"text": "Excellent location and quick service.", "guest_name": "Arjun", "date": "2026-03-04"},
                {"text": "Bathroom cleanliness needs improvement.", "guest_name": "Meera", "date": "2026-03-05"},
            ]

        prompt = (
            "You are a sentiment analysis engine for hotel reviews.\n"
            f"Reviews: {json.dumps(reviews)}\n\n"
            "Return ONLY valid JSON with keys: reviews_analysis, overall_sentiment, topic_breakdown, critical_alerts, improvement_suggestions."
        )

        raw = _invoke(prompt, max_tokens=1600)
        parsed = _extract_json(raw) or {}

        data = {
            "reviews_analysis": parsed.get("reviews_analysis")
            if isinstance(parsed.get("reviews_analysis"), list)
            else [],
            "overall_sentiment": parsed.get("overall_sentiment")
            if isinstance(parsed.get("overall_sentiment"), dict)
            else {},
            "topic_breakdown": parsed.get("topic_breakdown")
            if isinstance(parsed.get("topic_breakdown"), list)
            else [],
            "critical_alerts": parsed.get("critical_alerts")
            if isinstance(parsed.get("critical_alerts"), list)
            else [],
            "improvement_suggestions": parsed.get("improvement_suggestions")
            if isinstance(parsed.get("improvement_suggestions"), list)
            else [],
        }

        if not data["reviews_analysis"]:
            positive_words = {"great", "excellent", "clean", "friendly", "quick", "good"}
            negative_words = {"noisy", "slow", "dirty", "bad", "poor", "average", "improvement"}
            reviews_analysis = []
            pos = 0
            neg = 0
            neu = 0

            for review in reviews:
                text = (review.get("text") or "").lower()
                pos_hits = sum(1 for w in positive_words if w in text)
                neg_hits = sum(1 for w in negative_words if w in text)
                if pos_hits > neg_hits:
                    sentiment = "positive"
                    score = 0.8
                    pos += 1
                elif neg_hits > pos_hits:
                    sentiment = "negative"
                    score = 0.25
                    neg += 1
                else:
                    sentiment = "neutral"
                    score = 0.55
                    neu += 1
                reviews_analysis.append(
                    {
                        "text": review.get("text", ""),
                        "guest_name": review.get("guest_name", "Anonymous"),
                        "sentiment": sentiment,
                        "score": score,
                        "topics": ["service"],
                        "flagged_issues": [] if sentiment != "negative" else ["Review indicates dissatisfaction"],
                        "key_phrases": [],
                    }
                )

            total = max(len(reviews), 1)
            data["reviews_analysis"] = reviews_analysis
            data["overall_sentiment"] = {
                "score": round((pos * 1.0 + neu * 0.6 + neg * 0.2) / total, 2),
                "label": "Mostly Positive" if pos >= neg else "Mixed",
                "positive_pct": round((pos / total) * 100),
                "neutral_pct": round((neu / total) * 100),
                "negative_pct": round((neg / total) * 100),
            }
            data["topic_breakdown"] = [
                {"topic": "Service", "sentiment_score": 0.72, "mention_count": total},
                {"topic": "Cleanliness", "sentiment_score": 0.68, "mention_count": max(1, total - 1)},
            ]
            data["critical_alerts"] = (
                ["Some reviews flag operational issues requiring follow-up."] if neg > 0 else []
            )
            data["improvement_suggestions"] = [
                "Respond quickly to negative feedback and close the loop with guests.",
                "Track recurring service issues and assign owners.",
            ]

        return Response(data)


class BookingRiskView(APIView):
    def post(self, request):
        tenant_id = request.user.tenant_id
        today_iso = timezone.now().date().isoformat()

        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT id, guest_name, guest_email, guest_phone, check_in, check_out,
                       total_amount, amount_paid, status, payment_status, room_id, guests, notes
                FROM bookings
                WHERE tenant_id = %s
                  AND status IN ('pending', 'confirmed')
                ORDER BY check_in
                """,
                [tenant_id],
            )
            booking_cols = [c[0] for c in cur.description]
            bookings = [_serialize_row(r, booking_cols) for r in cur.fetchall()]
            bookings = [b for b in bookings if b.get("check_in") and b["check_in"] >= today_iso]

            cur.execute(
                """
                SELECT id, name, max_guests
                FROM rooms
                WHERE tenant_id = %s
                """,
                [tenant_id],
            )
            room_cols = [c[0] for c in cur.description]
            rooms = [_serialize_row(r, room_cols) for r in cur.fetchall()]

        context = json.dumps(
            {
                "rooms": [
                    _pick_fields(room, ["id", "name", "max_guests"]) for room in rooms
                ],
                "upcoming_bookings": [
                    _pick_fields(
                        booking,
                        [
                            "id",
                            "guest_name",
                            "guest_email",
                            "guest_phone",
                            "check_in",
                            "check_out",
                            "total_amount",
                            "amount_paid",
                            "status",
                            "payment_status",
                            "room_id",
                            "guests",
                        ],
                    )
                    for booking in bookings[:80]
                ],
            },
            separators=(",", ":"),
        )

        prompt = (
            "You are a booking risk engine.\n"
            f"Snapshot: {context}\n\n"
            "Return ONLY valid JSON with keys: booking_risks, overbooking_alerts, summary, recommendations."
        )
        raw = _invoke(prompt, max_tokens=1800)
        parsed = _extract_json(raw) or {}

        booking_risks = parsed.get("booking_risks")
        overbooking_alerts = parsed.get("overbooking_alerts")
        summary = parsed.get("summary")
        recommendations = parsed.get("recommendations")

        if not isinstance(booking_risks, list) or not isinstance(summary, dict):
            room_map = {r["id"]: r for r in rooms}
            booking_risks = []
            high = 0
            medium = 0
            low = 0
            revenue_at_risk = 0.0

            for b in bookings:
                score = 0.1
                risk_factors = []
                if b.get("payment_status") == "unpaid":
                    score += 0.35
                    risk_factors.append("No payment received")
                elif b.get("payment_status") == "partial":
                    score += 0.2
                    risk_factors.append("Only partial payment")
                if not b.get("guest_phone"):
                    score += 0.15
                    risk_factors.append("Missing phone number")
                if not b.get("guest_email"):
                    score += 0.1
                    risk_factors.append("Missing email")
                if b.get("status") == "pending":
                    score += 0.1
                    risk_factors.append("Booking still pending")

                try:
                    check_in = datetime.fromisoformat(str(b.get("check_in"))).date()
                    days_until = (check_in - timezone.now().date()).days
                    if days_until <= 2:
                        score += 0.1
                        risk_factors.append("Short lead time")
                except Exception:
                    pass

                no_show_prob = max(0.05, min(0.9, score))
                cancel_prob = max(0.05, min(0.8, score * 0.8))
                risk_level = "low"
                if no_show_prob >= 0.55:
                    risk_level = "high"
                    high += 1
                elif no_show_prob >= 0.35:
                    risk_level = "medium"
                    medium += 1
                else:
                    low += 1

                room = room_map.get(b.get("room_id"), {})
                revenue_at_risk += _safe_float(b.get("total_amount")) * no_show_prob
                booking_risks.append(
                    {
                        "booking_id": b.get("id"),
                        "guest_name": b.get("guest_name"),
                        "check_in": b.get("check_in"),
                        "room_name": room.get("name", "Unknown"),
                        "risk_level": risk_level,
                        "no_show_probability": round(no_show_prob, 2),
                        "cancellation_probability": round(cancel_prob, 2),
                        "risk_factors": risk_factors or ["Normal risk profile"],
                        "recommended_action": (
                            "Call guest and collect advance payment."
                            if risk_level == "high"
                            else "Send confirmation reminder."
                        ),
                    }
                )

            totals_by_date = {}
            for b in bookings:
                key = b.get("check_in")
                totals_by_date[key] = totals_by_date.get(key, 0) + 1
            overbooking_alerts = []
            total_rooms = len(rooms)
            for date_key, room_count in totals_by_date.items():
                if total_rooms and room_count > total_rooms:
                    overbooking_alerts.append(
                        {
                            "date": date_key,
                            "rooms_booked": room_count,
                            "total_rooms": total_rooms,
                            "risk": "Potential overbooking",
                        }
                    )

            avg_no_show = (
                sum(r["no_show_probability"] for r in booking_risks) / len(booking_risks)
                if booking_risks
                else 0
            )
            summary = {
                "total_upcoming": len(booking_risks),
                "high_risk": high,
                "medium_risk": medium,
                "low_risk": low,
                "estimated_no_show_rate": round(avg_no_show * 100),
                "total_revenue_at_risk": round(revenue_at_risk, 2),
            }
            recommendations = [
                "Collect advance payments for high-risk bookings.",
                "Send automated reminders 24 hours before check-in.",
            ]

        if not isinstance(overbooking_alerts, list):
            overbooking_alerts = []
        if not isinstance(recommendations, list):
            recommendations = [
                "Focus follow-up on high-risk bookings.",
                "Track risk trends weekly.",
            ]

        return Response(
            {
                "booking_risks": booking_risks,
                "overbooking_alerts": overbooking_alerts,
                "summary": summary,
                "recommendations": recommendations,
            }
        )


class BriefingView(APIView):
    def post(self, request):
        tenant_id = request.user.tenant_id
        user_sub = request.user.sub
        today = timezone.now().date()
        today_iso = today.isoformat()
        snapshot = _fetch_property_data(tenant_id)
        bookings = snapshot["bookings"]
        stats = snapshot["stats"]

        arrivals = [
            b for b in bookings if b.get("check_in") == today_iso and b.get("status") == "confirmed"
        ]
        departures = [b for b in bookings if b.get("check_out") == today_iso]
        revenue_today = sum(
            _safe_float(b.get("total_amount")) for b in arrivals if b.get("status") != "cancelled"
        )

        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT full_name
                FROM profiles
                WHERE id = %s
                """,
                [user_sub],
            )
            row = cur.fetchone()
        manager_name = row[0] if row and row[0] else "Manager"
        context = _build_ai_context(
            snapshot,
            booking_limit=10,
            room_limit=10,
        )

        prompt = (
            "Generate a concise daily hotel briefing in JSON.\n"
            f"Manager: {manager_name}\n"
            f"Property: {snapshot['tenant'].get('name', 'Property')}\n"
            f"Date: {today_iso}\n"
            f"Occupancy: {stats['occupancy_rate']}%\n"
            f"Arrivals: {len(arrivals)}\n"
            f"Departures: {len(departures)}\n"
            f"Outstanding payments: {stats['outstanding_payments']}\n"
            f"Dirty rooms: {stats['dirty_rooms']}\n"
            f"Snapshot: {context}\n\n"
            "Return ONLY valid JSON with keys: greeting, key_metrics, priority_actions, opportunities, risks, forecast_note."
        )

        raw = _invoke(prompt, max_tokens=900)
        parsed = _extract_json(raw) or {}

        if not isinstance(parsed, dict) or not parsed:
            parsed = {
                "greeting": f"Good day, {manager_name}. Here is your briefing for {today_iso}.",
                "key_metrics": {
                    "occupancy": stats["occupancy_rate"],
                    "arrivals": len(arrivals),
                    "departures": len(departures),
                    "revenue_today": round(revenue_today, 2),
                },
                "priority_actions": [
                    {
                        "priority": "high" if stats["outstanding_payments"] > 0 else "medium",
                        "action": "Follow up on outstanding guest payments.",
                        "category": "payments",
                    },
                    {
                        "priority": "medium",
                        "action": "Prioritize cleaning for dirty rooms before new arrivals.",
                        "category": "operations",
                    },
                ],
                "opportunities": ["Use targeted upsell offers for incoming bookings."],
                "risks": (
                    ["Outstanding balance risk on active bookings."]
                    if stats["outstanding_payments"] > 0
                    else []
                ),
                "forecast_note": "Expected demand remains stable for the next few days.",
            }

        return Response(parsed)
