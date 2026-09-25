"""
Staff results API under /api/v1/results/ (Phase 3). Every queryset comes from
`attempts_for` / `tests_for` (decision #5); out-of-scope ids answer 404.
"""

from django.http import HttpResponse
from rest_framework.exceptions import NotFound
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.content.scoping import tests_for
from apps.core.pagination import StandardPagination
from apps.core.permissions import IsStaffMember

from .scoping import attempts_for
from .serializers_results import AttemptDetailSerializer, AttemptListSerializer
from .services import results


class ResultsPagination(StandardPagination):
    """Adds `summary` (numbers over the WHOLE filtered set, not just the page)."""

    def get_paginated_response(self, data):
        response = super().get_paginated_response(data)
        response.data["summary"] = self.summary
        return response


class ResultListView(ListAPIView):
    permission_classes = [IsStaffMember]
    serializer_class = AttemptListSerializer
    pagination_class = ResultsPagination

    def get_queryset(self):
        return results.filtered_attempts(self.request.user, self.request.query_params)

    def paginate_queryset(self, queryset):
        self.paginator.summary = results.summarize_attempts(queryset)
        return super().paginate_queryset(queryset)


class ResultDetailView(APIView):
    permission_classes = [IsStaffMember]

    def get(self, request, pk):
        attempt = (
            attempts_for(request.user)
            .select_related("test__subject", "branch")
            .prefetch_related("items")
            .filter(pk=pk)
            .first()
        )
        if attempt is None:
            raise NotFound("Topilmadi.")
        return Response(AttemptDetailSerializer(attempt).data)


class TestSummaryView(APIView):
    permission_classes = [IsStaffMember]

    def get(self, request, pk):
        test = tests_for(request.user).select_related("subject", "branch").filter(pk=pk).first()
        if test is None:
            raise NotFound("Topilmadi.")
        return Response(results.test_results_summary(request.user, test))


class ResultExportView(APIView):
    permission_classes = [IsStaffMember]

    def get(self, request):
        qs = results.filtered_attempts(request.user, request.query_params)
        content = results.build_workbook(qs)
        response = HttpResponse(
            content, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = f'attachment; filename="{results.export_filename()}"'
        response["Cache-Control"] = "no-store"
        return response
