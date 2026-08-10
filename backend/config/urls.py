"""config URL Configuration — grouped by module so the Swagger docs mirror
this same grouping (auth, superadmin/tenants, employees, customers)."""

from django.contrib import admin
from django.urls import include, path, re_path
from drf_yasg import openapi
from drf_yasg.views import get_schema_view
from rest_framework import permissions

schema_view = get_schema_view(
    openapi.Info(
        title='Tenant Architecture API',
        default_version='v1',
        description='Multi-tenant (database-per-tenant) platform API',
    ),
    public=True,
    permission_classes=[permissions.AllowAny],
)

urlpatterns = [
    path('admin/', admin.site.urls),

    # Central/superadmin routes — never resolved through a tenant.
    path('api/auth/', include('core_auth.urls')),
    path('api/superadmin/', include('tenants.urls')),

    # Tenant-scoped routes, prefixed with the company slug, e.g.
    # /api/tata/employees/, /api/tesla/customers/, /api/tata/public-info/
    path('api/<slug:tenant_slug>/', include('modules.employees.urls')),
    path('api/<slug:tenant_slug>/', include('modules.customers.urls')),
    path('api/<slug:tenant_slug>/', include('tenants.urls_tenant_scoped')),
    path('api/<slug:tenant_slug>/auth/', include('core_auth.urls_tenant_scoped')),

    # Swagger / OpenAPI docs, grouped by tag to match the router structure above.
    re_path(r'^swagger(?P<format>\.json|\.yaml)$', schema_view.without_ui(cache_timeout=0), name='schema-json'),
    path('swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
    path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
]
