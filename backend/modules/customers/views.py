from rest_framework import viewsets

from core_auth.permissions import IsTenantUserOrSuperAdmin
from tenants.dynamic_models import get_dynamic_model
from tenants.mixins import TenantEntityViewSetMixin

from .serializers import build_dynamic_customer_serializer


class CustomerViewSet(TenantEntityViewSetMixin, viewsets.ModelViewSet):
    """Tenant-scoped Customer CRUD — mirrors employees.views.EmployeeViewSet."""

    entity = 'customer'
    permission_classes = [IsTenantUserOrSuperAdmin]

    def get_queryset(self):
        model = get_dynamic_model('customer', self.request.tenant)
        return model.objects.using(self.request.tenant.slug).all()

    def get_serializer_class(self):
        return build_dynamic_customer_serializer(self.request.tenant, request=self.request)
