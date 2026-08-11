from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .audit import log_superadmin_action
from .entities import ENTITY_CODE_PREFIX, ENTITY_TO_MODULE_KEY
from .limits import effective_limit
from .unique_id import generate_entity_code


class TenantEntityViewSetMixin:
    """Shared behaviour for tenant-scoped Employee/Customer viewsets:
    - GET .../schema/ — the tenant's enabled field list (key/label/type/required),
      used by the frontend to render dynamic forms/tables without hardcoding fields.
    - Audit logging whenever a Superadmin (as opposed to a tenant user) mutates
      a tenant's data directly, per the cross-tenant-edit auditing requirement.
    - Trial (5 records) / Complete (Superadmin-configurable) record-count
      enforcement on create — see tenants.limits.effective_limit.

    Subclasses must set `entity` ('employee' or 'customer') and implement
    `get_queryset`/`get_serializer_class` as usual.
    """

    entity = None

    @action(detail=False, methods=['get'])
    def schema(self, request, **kwargs):
        configs = request.tenant.field_configs.select_related('field').filter(
            enabled=True, field__entity=self.entity,
        ).order_by('order')
        # 'code' is a fixed, server-generated column (not part of the
        # configurable FieldCatalog) — always shown first, never editable.
        code_column = {
            'key': 'code', 'label': 'Code', 'data_type': 'string',
            'required': False, 'options': None, 'readonly': True,
        }
        return Response([code_column] + [
            {
                'key': cfg.field.field_key,
                'label': cfg.field.label,
                'data_type': cfg.field.data_type,
                'required': cfg.is_required,
                'options': cfg.field.options,
                'readonly': False,
            }
            for cfg in configs
        ])

    def _maybe_audit(self, action_name, pk):
        if self.request.auth is None or self.request.auth.get('role') != 'superadmin':
            return
        actor = self.request.auth.get('username', 'superadmin')
        log_superadmin_action(
            self.request.tenant, actor, f'{action_name}_{self.entity}', detail={'id': pk},
        )

    def perform_create(self, serializer):
        tenant = self.request.tenant
        table_key = ENTITY_TO_MODULE_KEY.get(self.entity)
        limit = effective_limit(tenant, table_key)
        if limit is not None and self.get_queryset().count() >= limit:
            raise ValidationError(
                f'This company has reached its {limit}-record limit for {table_key}. '
                f'Ask Superadmin to raise it (Complete tier only).'
            )

        prefix = ENTITY_CODE_PREFIX.get(self.entity, self.entity.upper())
        instance = serializer.save(code=generate_entity_code(tenant.slug, prefix))
        self._maybe_audit('create', instance.pk)

    def perform_update(self, serializer):
        instance = serializer.save()
        self._maybe_audit('update', instance.pk)

    def perform_destroy(self, instance):
        pk = instance.pk
        instance.delete()
        self._maybe_audit('delete', pk)
