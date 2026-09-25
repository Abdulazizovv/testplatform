from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_safe


@require_safe
@never_cache
def healthz(request):
    """Liveness probe (Docker HEALTHCHECK, uptime monitors). No DB access on purpose."""
    return JsonResponse({"ok": True})
