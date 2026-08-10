from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import FieldCatalog, Tenant, TenantFieldConfig
from .provisioning import provision_tenant
from .schema_sync import sync_tenant_schema
from .serializers import FieldCatalogSerializer, TenantOnboardingSerializer, TenantSerializer


class IsSuperAdmin(permissions.BasePermission):
    """Only a validated superadmin JWT (role=superadmin, see
    core_auth.views.SuperAdminLoginView) may manage the tenant registry,
    field catalog, or any tenant's field configuration."""

    def has_permission(self, request, view):
        return request.auth is not None and request.auth.get('role') == 'superadmin'


class TenantViewSet(viewsets.ModelViewSet):
    """Superadmin-only tenant registry: list/create/suspend/reactivate companies."""

    queryset = Tenant.objects.all().order_by('-created_at')
    serializer_class = TenantSerializer
    permission_classes = [IsSuperAdmin]

    def create(self, request, *args, **kwargs):
        onboarding = TenantOnboardingSerializer(data=request.data)
        onboarding.is_valid(raise_exception=True)
        tenant = provision_tenant(**onboarding.validated_data)
        return Response(TenantSerializer(tenant).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def suspend(self, request, pk=None):
        tenant = self.get_object()
        tenant.status = Tenant.STATUS_SUSPENDED
        tenant.save(update_fields=['status'])
        return Response(TenantSerializer(tenant).data)

    @action(detail=True, methods=['post'])
    def reactivate(self, request, pk=None):
        tenant = self.get_object()
        tenant.status = Tenant.STATUS_ACTIVE
        tenant.save(update_fields=['status'])
        return Response(TenantSerializer(tenant).data)

    @action(detail=True, methods=['get', 'post'], url_path='field-config')
    def field_config(self, request, pk=None):
        """GET: every FieldCatalog entry merged with this tenant's current
        enabled/required/order (defaulting to disabled if never configured).
        POST: bulk upsert that selection — e.g. [{"field": 3, "enabled": true,
        "is_required": false, "order": 0}, ...] — then immediately runs
        sync_tenant_schema so newly-enabled fields get their real DB column
        right away, without a separate migration step."""
        tenant = self.get_object()

        if request.method == 'GET':
            entity = request.query_params.get('entity')
            catalog = FieldCatalog.objects.all().order_by('entity', 'field_key')
            if entity:
                catalog = catalog.filter(entity=entity)
            configs_by_field = {
                cfg.field_id: cfg for cfg in tenant.field_configs.select_related('field')
            }
            return Response([
                {
                    'field': field.id,
                    'entity': field.entity,
                    'key': field.field_key,
                    'label': field.label,
                    'data_type': field.data_type,
                    'enabled': configs_by_field[field.id].enabled if field.id in configs_by_field else False,
                    'is_required': configs_by_field[field.id].is_required if field.id in configs_by_field else False,
                    'order': configs_by_field[field.id].order if field.id in configs_by_field else 0,
                }
                for field in catalog
            ])

        for row in request.data:
            TenantFieldConfig.objects.update_or_create(
                tenant=tenant, field_id=row['field'],
                defaults={
                    'enabled': row.get('enabled', False),
                    'is_required': row.get('is_required', False),
                    'order': row.get('order', 0),
                },
            )

        sync_tenant_schema(tenant)
        return Response({'detail': 'Field configuration updated.'})

    @action(detail=True, methods=['get', 'post'])
    def users(self, request, pk=None):
        """GET: usernames that can log in to this tenant (never returns
        passwords — they're hashed, one-way). POST: create a new login user
        directly in this tenant's own database (each company has a fully
        separate auth_user table — see DOCUMENTATION.md §8.4)."""
        tenant = self.get_object()

        if request.method == 'GET':
            usernames = User.objects.using(tenant.slug).values_list('username', flat=True)
            return Response([{'username': u} for u in usernames])

        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')
        if not username or not password:
            return Response({'detail': 'username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(password) < 8:
            return Response({'detail': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.using(tenant.slug).filter(username=username).exists():
            return Response({'detail': 'That username already exists for this company.'}, status=status.HTTP_400_BAD_REQUEST)

        User.objects.using(tenant.slug).create(username=username, password=make_password(password))
        return Response({'username': username}, status=status.HTTP_201_CREATED)


class FieldCatalogViewSet(viewsets.ModelViewSet):
    """Superadmin-managed master field list (e.g. the 14 possible Employee fields)."""

    queryset = FieldCatalog.objects.all().order_by('entity', 'field_key')
    serializer_class = FieldCatalogSerializer
    permission_classes = [IsSuperAdmin]
