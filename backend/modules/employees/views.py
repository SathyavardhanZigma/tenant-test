from rest_framework import viewsets

from core_auth.permissions import IsTenantUserOrSuperAdmin
from tenants.dynamic_models import get_dynamic_model
from tenants.mixins import TenantEntityViewSetMixin

from .serializers import build_dynamic_employee_serializer


class EmployeeViewSet(TenantEntityViewSetMixin, viewsets.ModelViewSet):
    """Tenant-scoped Employee CRUD. request.tenant is set by
    TenantResolverMiddleware; DATABASE_ROUTERS sends these queries to that
    tenant's DB automatically. Both the queryset's model and the serializer
    are built per-request from the tenant's TenantFieldConfig selection (see
    tenants.dynamic_models.get_dynamic_model) — Reachable by that tenant's
    own users, or by Superadmin accessing any company."""

    entity = 'employee'
    permission_classes = [IsTenantUserOrSuperAdmin]

    def get_queryset(self):
        model = get_dynamic_model('employee', self.request.tenant)
        return model.objects.using(self.request.tenant.slug).all()

    def get_serializer_class(self):
        return build_dynamic_employee_serializer(self.request.tenant, request=self.request)
