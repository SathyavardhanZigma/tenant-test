"""Tenant-scoped auth, mounted at /api/<tenant_slug>/auth/ in config/urls.py."""

from django.urls import path

from .views import TenantLoginView
from .views_tenant_scoped import StaffListView, StaffPermissionView, TenantEntitlementsView

urlpatterns = [
    path('login/', TenantLoginView.as_view(), name='tenant-login'),
    path('entitlements/', TenantEntitlementsView.as_view(), name='tenant-entitlements'),
    path('staff/', StaffListView.as_view(), name='staff-list'),
    path('staff/<str:username>/permissions/', StaffPermissionView.as_view(), name='staff-permissions'),
]
