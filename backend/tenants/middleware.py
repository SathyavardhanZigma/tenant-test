from django.http import JsonResponse

from .context import clear_current_tenant, set_current_tenant
from .db_registry import register_tenant_database
from .models import Tenant

# Routes that never need a tenant resolved: superadmin panel + auth, schema/docs.
TENANT_EXEMPT_PREFIXES = (
    '/__superadmin',
    '/api/superadmin',
    '/api/auth/superadmin',
    '/swagger',
    '/redoc',
    '/admin',
    '/media',
)


class TenantResolverMiddleware:
    """Resolves the active tenant from the URL slug (or X-Tenant header for API
    clients), binds its DB connection for the duration of the request via
    tenants.context, and clears that context once the response is built so it
    never leaks into the next request handled by the same worker."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith(TENANT_EXEMPT_PREFIXES):
            return self.get_response(request)

        slug = self._resolve_slug(request)
        if slug is None:
            return self.get_response(request)

        try:
            tenant = Tenant.objects.get(slug=slug)
        except Tenant.DoesNotExist:
            return JsonResponse({'detail': 'Unknown company.'}, status=404)

        if tenant.status != Tenant.STATUS_ACTIVE:
            return JsonResponse({'detail': 'This company account is suspended.'}, status=403)

        # Register the tenant DB alias lazily when the tenant is actually used,
        # instead of querying during AppConfig.ready().
        register_tenant_database(tenant)
        set_current_tenant(tenant, tenant.slug)
        try:
            request.tenant = tenant
            response = self.get_response(request)
        finally:
            clear_current_tenant()
        return response

    @staticmethod
    def _resolve_slug(request):
        header_slug = request.headers.get('X-Tenant')
        if header_slug:
            return header_slug

        # e.g. /api/tata/employees/  or  /tata/dashboard
        parts = [p for p in request.path.split('/') if p]
        if parts and parts[0] == 'api' and len(parts) > 1:
            return parts[1]
        if parts:
            return parts[0]
        return None
