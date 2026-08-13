from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from ..db_registry import register_tenant_database
from ..entities import ENTITY_TO_MODULE_KEY, MODULE_CHOICES
from ..models import FieldCatalog, Tenant, TenantFieldConfig, TenantModule, TenantTableLimit
from ..provisioning import create_tenant_record, drop_tenant_database, tenant_ddl_privileges
from ..schema_sync import drop_entity_table, ensure_entity_table, sync_tenant_schema
from ..serializers import FieldCatalogSerializer, TenantOnboardingSerializer, TenantSerializer
from ..tasks import provision_tenant_task
from .permissions import IsSuperAdmin


class TenantViewSet(viewsets.ModelViewSet):
    """Superadmin-only tenant registry: list/create/suspend/reactivate companies."""

    queryset = Tenant.objects.prefetch_related('modules').order_by('-created_at')
    serializer_class = TenantSerializer
    permission_classes = [IsSuperAdmin]
    filter_backends = [filters.SearchFilter]
    search_fields = ['company_name', 'slug', 'owner_name', 'owner_email']

    def get_object(self):
        # Superadmin routes are exempt from TenantResolverMiddleware, so
        # unlike tenant-scoped requests, nothing lazily registers this
        # tenant's DB connection for us. Actions here (field-config, modules,
        # table-limits, users) touch the tenant's physical database, and
        # since provisioning now runs in a separate Celery worker process,
        # this web server process may never have registered it itself —
        # do it here so it's never process-dependent.
        tenant = super().get_object()
        register_tenant_database(tenant)
        return tenant

    def create(self, request, *args, **kwargs):
        onboarding = TenantOnboardingSerializer(data=request.data)
        onboarding.is_valid(raise_exception=True)
        tenant = create_tenant_record(**onboarding.validated_data)
        provision_tenant_task.delay(tenant.id)
        return Response(TenantSerializer(tenant).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['post'], url_path='retry-provisioning')
    def retry_provisioning(self, request, pk=None):
        tenant = self.get_object()
        if tenant.provisioning_status != Tenant.PROVISIONING_FAILED:
            return Response({'detail': 'Only failed provisioning can be retried.'}, status=status.HTTP_400_BAD_REQUEST)
        tenant.provisioning_status = Tenant.PROVISIONING_PENDING
        tenant.provisioning_error = ''
        tenant.save(update_fields=['provisioning_status', 'provisioning_error'])
        provision_tenant_task.delay(tenant.id)
        return Response(TenantSerializer(tenant).data)

    def destroy(self, request, *args, **kwargs):
        """Deleting a company drops its entire physical database first —
        this is irreversible, not a soft-delete."""
        tenant = self.get_object()
        drop_tenant_database(tenant)
        return super().destroy(request, *args, **kwargs)

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
        enabled/required/order (defaulting to disabled if never configured, or
        if the owning module isn't enabled for this tenant).
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
            enabled_module_keys = set(tenant.modules.filter(enabled=True).values_list('module_key', flat=True))
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
                    'enabled': (
                        configs_by_field[field.id].enabled
                        if field.id in configs_by_field and ENTITY_TO_MODULE_KEY.get(field.entity) in enabled_module_keys
                        else False
                    ),
                    'is_required': configs_by_field[field.id].is_required if field.id in configs_by_field else False,
                    'order': configs_by_field[field.id].order if field.id in configs_by_field else 0,
                }
                for field in catalog
            ])

        for row in request.data:
            field = get_object_or_404(FieldCatalog, pk=row['field'])
            module_key = ENTITY_TO_MODULE_KEY.get(field.entity)
            module_enabled = (
                module_key is None
                or tenant.modules.filter(module_key=module_key, enabled=True).exists()
            )
            TenantFieldConfig.objects.update_or_create(
                tenant=tenant, field=field,
                defaults={
                    'enabled': row.get('enabled', False) if module_enabled else False,
                    'is_required': row.get('is_required', False) if module_enabled else False,
                    'order': row.get('order', 0),
                },
            )

        with tenant_ddl_privileges(tenant):
            sync_tenant_schema(tenant)
        return Response({'detail': 'Field configuration updated.'})

    @action(detail=True, methods=['get', 'post'])
    def modules(self, request, pk=None):
        """GET/POST which of the fixed modules (employees, customers) this
        tenant has enabled. Disabling a module also disables its fields."""
        tenant = self.get_object()

        if request.method == 'GET':
            enabled_by_key = {m.module_key: m.enabled for m in tenant.modules.all()}
            return Response([
                {'module_key': key, 'label': label, 'enabled': enabled_by_key.get(key, False)}
                for key, label in MODULE_CHOICES
            ])

        valid_keys = {key for key, _ in MODULE_CHOICES}
        selected_keys = set(request.data.get('module_keys', [])) & valid_keys
        previously_enabled = set(tenant.modules.filter(enabled=True).values_list('module_key', flat=True))

        for module_key in valid_keys:
            TenantModule.objects.update_or_create(
                tenant=tenant, module_key=module_key,
                defaults={'enabled': module_key in selected_keys},
            )

        disabled_entities = [
            entity for entity, module_key in ENTITY_TO_MODULE_KEY.items()
            if module_key not in selected_keys
        ]
        if disabled_entities:
            TenantFieldConfig.objects.filter(
                tenant=tenant, field__entity__in=disabled_entities,
            ).update(enabled=False, is_required=False)

        # A module going enabled -> disabled drops its table outright (not a
        # soft-hide); going disabled -> enabled recreates the base table so
        # the module works again, then sync_tenant_schema adds back whatever
        # fields are configured for it.
        newly_disabled = previously_enabled - selected_keys
        newly_enabled = selected_keys - previously_enabled
        if newly_disabled or newly_enabled or disabled_entities:
            with tenant_ddl_privileges(tenant):
                for entity, module_key in ENTITY_TO_MODULE_KEY.items():
                    if module_key in newly_disabled:
                        drop_entity_table(tenant, entity)
                    elif module_key in newly_enabled:
                        ensure_entity_table(tenant, entity)

                if newly_enabled or disabled_entities:
                    sync_tenant_schema(tenant)

        return Response({'detail': 'Modules updated.'})

    @action(detail=True, methods=['get', 'post'], url_path='table-limits')
    def table_limits(self, request, pk=None):
        """GET/POST this company's tier (trial/complete, record limits) and
        plan (basic=read-only/enterprise=full-CRUD), plus for Complete
        tenants, the max-records-per-table configuration. Trial tenants
        always show/enforce TRIAL_RECORD_LIMIT regardless of any row here —
        see tenants.limits.effective_limit, which perform_create checks."""
        from ..models import TRIAL_RECORD_LIMIT

        tenant = self.get_object()

        if request.method == 'GET':
            limits_by_table = {tl.table_key: tl.max_records for tl in tenant.table_limits.all()}
            enabled_keys = set(tenant.modules.filter(enabled=True).values_list('module_key', flat=True))
            return Response({
                'tier': tenant.tier,
                'plan': tenant.plan,
                'trial_record_limit': TRIAL_RECORD_LIMIT,
                'tables': [
                    {'table_key': key, 'label': label, 'max_records': limits_by_table.get(key)}
                    for key, label in TenantTableLimit.TABLE_CHOICES
                    if key in enabled_keys
                ],
            })

        tier = request.data.get('tier')
        if tier and tier not in dict(Tenant.TIER_CHOICES):
            return Response({'detail': 'Unknown tier.'}, status=status.HTTP_400_BAD_REQUEST)

        plan = request.data.get('plan')
        if plan and plan not in dict(Tenant.PLAN_CHOICES):
            return Response({'detail': 'Unknown plan.'}, status=status.HTTP_400_BAD_REQUEST)

        update_fields = []
        if tier:
            tenant.tier = tier
            update_fields.append('tier')
        if plan:
            tenant.plan = plan
            update_fields.append('plan')
        if update_fields:
            tenant.save(update_fields=update_fields)

        for row in request.data.get('tables', []):
            TenantTableLimit.objects.update_or_create(
                tenant=tenant, table_key=row['table_key'],
                defaults={'max_records': row.get('max_records')},
            )

        return Response({'detail': 'Limits updated.'})

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
