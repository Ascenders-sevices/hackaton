from django.urls import path, include

urlpatterns = [
    path("api/", include("api.urls")),
    path("ai/", include("api.urls_ai")),
]
