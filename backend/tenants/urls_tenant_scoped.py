"""Tenant-scoped (slug-prefixed) routes, mounted at /api/<tenant_slug>/ in
config/urls.py — separate from tenants.urls, which holds the superadmin-only
/api/superadmin/ registry routes."""

from django.urls import path

from .public_views import TenantPublicInfoView

urlpatterns = [
    path('public-info/', TenantPublicInfoView.as_view(), name='tenant-public-info'),
]
