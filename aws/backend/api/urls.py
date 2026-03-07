from django.urls import path
from api.views import (
    bookings,
    dashboard,
    demo_seed,
    guests,
    housekeeping,
    marketing,
    messaging,
    rooms,
    settings_view,
)

urlpatterns = [
    # Dashboard
    path("dashboard/stats", dashboard.DashboardStats.as_view()),

    # Rooms
    path("rooms", rooms.RoomList.as_view()),
    path("rooms/<str:room_id>", rooms.RoomDetail.as_view()),

    # Bookings
    path("bookings", bookings.BookingList.as_view()),
    path("bookings/<str:booking_id>", bookings.BookingDetail.as_view()),

    # Guests
    path("guests", guests.GuestList.as_view()),
    path("guests/<str:guest_id>", guests.GuestDetail.as_view()),

    # Housekeeping
    path("housekeeping", housekeeping.HousekeepingList.as_view()),
    path("housekeeping/<str:room_id>", housekeeping.HousekeepingDetail.as_view()),

    # Settings
    path("settings", settings_view.SettingsView.as_view()),
    path("settings/room-categories", settings_view.RoomCategoriesView.as_view()),

    # Messaging
    path("messaging", messaging.MessagingDashboard.as_view()),
    path("messaging/templates", messaging.MessageTemplateList.as_view()),
    path("messaging/templates/<str:template_id>", messaging.MessageTemplateDetail.as_view()),
    path("messaging/send", messaging.MessagingSendView.as_view()),

    # Marketing
    path("marketing", marketing.MarketingDashboard.as_view()),
    path("marketing/contacts", marketing.MarketingContactList.as_view()),
    path("marketing/segments", marketing.MarketingSegmentList.as_view()),
    path("marketing/segments/<str:segment_id>", marketing.MarketingSegmentDetail.as_view()),
    path("marketing/campaigns", marketing.CampaignList.as_view()),
    path("marketing/campaigns/<str:campaign_id>", marketing.CampaignDetail.as_view()),
    path("marketing/campaigns/<str:campaign_id>/launch", marketing.CampaignLaunch.as_view()),

    # Demo seed
    path("demo/seed", demo_seed.DemoSeedView.as_view()),
]
