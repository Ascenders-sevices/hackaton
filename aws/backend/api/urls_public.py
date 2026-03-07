from django.urls import path

from api.views.public_booking import PublicBookingCreateView, PublicPropertyView


urlpatterns = [
    path("properties/<slug:property_slug>", PublicPropertyView.as_view()),
    path("properties/<slug:property_slug>/bookings", PublicBookingCreateView.as_view()),
]
