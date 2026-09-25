from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.core.views import healthz

admin.site.site_header = "Bilim sinash platformasi — boshqaruv"
admin.site.site_title = "Platforma admin"
admin.site.index_title = "Filiallar va foydalanuvchilar"

urlpatterns = [
    path("healthz/", healthz),
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.accounts.users_urls")),
    path("api/v1/", include("apps.branches.urls")),
    path("api/v1/", include("apps.content.urls")),
    path("api/v1/", include("apps.attempts.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
