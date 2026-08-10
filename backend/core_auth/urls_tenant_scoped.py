"""Tenant-scoped auth, mounted at /api/<tenant_slug>/auth/ in config/urls.py."""

from django.urls import path

from .views import TenantLoginView

urlpatterns = [
    path('login/', TenantLoginView.as_view(), name='tenant-login'),
]
