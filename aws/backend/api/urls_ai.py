from django.urls import path
from api.views.ai import (
    CopilotView,
    ForecastView,
    PricingView,
    GuestIntelligenceView,
    SentimentView,
    BookingRiskView,
    BriefingView,
)

urlpatterns = [
    path("copilot", CopilotView.as_view()),
    path("forecast", ForecastView.as_view()),
    path("pricing", PricingView.as_view()),
    path("guest-intelligence", GuestIntelligenceView.as_view()),
    path("sentiment", SentimentView.as_view()),
    path("booking-risk", BookingRiskView.as_view()),
    path("briefing", BriefingView.as_view()),
]
