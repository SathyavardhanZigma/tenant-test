from rest_framework.pagination import PageNumberPagination


class ConfigurablePageNumberPagination(PageNumberPagination):
    """Same as DRF's default PageNumberPagination, but callers can override
    the page size per-request via ?page_size=<n> (e.g. the Superadmin
    dashboard's page-size dropdown), capped at max_page_size."""

    page_size_query_param = 'page_size'
    max_page_size = 200
