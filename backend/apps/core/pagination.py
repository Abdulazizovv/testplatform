from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Every list endpoint is paginated; clients never assume a bare array."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
