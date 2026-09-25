"""
Throttles for the anonymous API. Client IP comes from DRF's get_ident(): with
NUM_PROXIES=1 it is the single X-Forwarded-For value nginx writes (real client address,
client-supplied values are overwritten - see nginx/default.conf).
"""

from rest_framework.throttling import SimpleRateThrottle


class _IpThrottle(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class PublicReadThrottle(_IpThrottle):
    scope = "public_read"


class PublicAnswerThrottle(_IpThrottle):
    """A whole classroom may share one NAT address, so this is per IP but generous."""

    scope = "public_answers"


class AttemptCreateThrottle(_IpThrottle):
    scope = "attempt_create"


class AttemptTokenThrottle(SimpleRateThrottle):
    """Per attempt: one runaway tab/script cannot hammer a single attempt."""

    scope = "attempt_token"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": view.kwargs.get("token", "")}
