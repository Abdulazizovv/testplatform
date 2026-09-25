from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.permissions import IsStaffMember, IsSuperAdminOrBranchAdmin
from apps.core.roles import Role

from .scoping import users_for
from .serializers import LoginSerializer, ManagedUserSerializer, UserSerializer

# DRF views are csrf_exempt and only enforce CSRF for *already authenticated* sessions,
# which leaves login/logout open to login-CSRF. csrf_protect on dispatch closes that.
_csrf = method_decorator(csrf_protect, name="dispatch")


@method_decorator([ensure_csrf_cookie, never_cache], name="dispatch")
class CsrfView(APIView):
    """GET: sets the csrftoken cookie and returns the token. Call before login."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


@_csrf
class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"detail": "Login va parolni kiriting."}, status=status.HTTP_400_BAD_REQUEST
            )
        http_request = request._request  # axes reads/writes state on the HttpRequest
        user = authenticate(
            http_request,
            username=serializer.validated_data["username"],
            password=serializer.validated_data["password"],
        )
        if getattr(http_request, "axes_locked_out", False):
            return Response(
                {"detail": "Juda ko'p noto'g'ri urinish. Birozdan so'ng qayta urinib ko'ring."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        if user is None or not user.is_active:
            return Response(
                {"detail": "Login yoki parol noto'g'ri."}, status=status.HTTP_400_BAD_REQUEST
            )
        if user.role != Role.SUPERADMIN and not user.is_operational:
            return Response(
                {"detail": "Filialingiz faol emas. Administrator bilan bog'laning."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        login(http_request, user)
        return Response(UserSerializer(user).data)


@_csrf
class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        logout(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(never_cache, name="dispatch")
class MeView(APIView):
    # IsStaffMember also rejects users of an inactive branch (existing sessions included).
    permission_classes = [IsStaffMember]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UserViewSet(viewsets.ModelViewSet):
    """
    Staff-panel user management. Superadmin: all users. Branch admin: users of their own
    branch (teachers and admins). DELETE deactivates (is_active=False), it never removes.
    """

    permission_classes = [IsSuperAdminOrBranchAdmin]
    serializer_class = ManagedUserSerializer

    def get_queryset(self):
        qs = users_for(self.request.user).select_related("branch").prefetch_related("subjects")
        params = self.request.query_params
        if params.get("role") in Role.values:
            qs = qs.filter(role=params["role"])
        if params.get("is_active") in ("true", "false"):
            qs = qs.filter(is_active=params["is_active"] == "true")
        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(username__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )
        return qs

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        if user.pk == request.user.pk:
            raise PermissionDenied("O'zingizni faolsizlantira olmaysiz.")
        user.is_active = False
        user.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
