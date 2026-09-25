from django.db.models import ProtectedError
from rest_framework import status, viewsets
from rest_framework.response import Response

from apps.accounts.scoping import branches_for
from apps.core.exceptions import BusinessError
from apps.core.permissions import IsStaffMember, IsSuperAdmin

from .serializers import BranchSerializer


class BranchViewSet(viewsets.ModelViewSet):
    """Superadmin: full CRUD. Admin/teacher: read-only, their own branch only."""

    serializer_class = BranchSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsStaffMember()]
        return [IsSuperAdmin()]

    def get_queryset(self):
        return branches_for(self.request.user)

    def destroy(self, request, *args, **kwargs):
        branch = self.get_object()
        try:
            branch.delete()
        except ProtectedError:
            raise BusinessError(
                "Filialda foydalanuvchilar yoki kontent bor. "
                "Avval ularni o'chiring yoki filialni faolsizlantiring.",
                status_code=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
