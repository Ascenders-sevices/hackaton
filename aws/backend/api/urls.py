from django.urls import path
from api.views import rooms, bookings, guests, housekeeping, settings_view, dashboard

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
]
