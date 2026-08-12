"""Tenant-scoped (slug-prefixed) routes, mounted at /api/<tenant_slug>/ in
config/urls.py — separate from tenants.urls, which holds the superadmin-only
/api/superadmin/ registry routes."""

from django.urls import path

from .public_views import TenantPublicInfoView
from .views.dashboard import TenantCapabilitiesView, TenantDashboardView

urlpatterns = [
    path('public-info/', TenantPublicInfoView.as_view(), name='tenant-public-info'),
    path('dashboard/', TenantDashboardView.as_view(), name='tenant-dashboard'),
    path('capabilities/', TenantCapabilitiesView.as_view(), name='tenant-capabilities'),
]
