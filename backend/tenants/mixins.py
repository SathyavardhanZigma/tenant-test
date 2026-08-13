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
    - Trial (TRIAL_RECORD_LIMIT records) / Complete (Superadmin-configurable)
      record-count enforcement on create — see tenants.limits.effective_limit.

    Subclasses must set `entity` ('employee' or 'customer') and implement
    `get_queryset`/`get_serializer_class` as usual.
    """

    entity = None

    @action(detail=False, methods=['get'])
    def schema(self, request, **kwargs):
        from core_auth.field_filter import visible_field_keys
        from core_auth.models import Role

        configs = request.tenant.field_configs.select_related('field').filter(
            enabled=True, field__entity=self.entity,
        ).order_by('order')

        # Mirrors the field-level filtering the dynamic CRUD serializer
        # applies (see modules/employees/serializers.py) — without this, a
        # staff user with a narrower StaffFieldGrant selection would still see
        # a form field/table column here for data the list/create/update
        # endpoints actually hide from them.
        module_key = ENTITY_TO_MODULE_KEY.get(self.entity)
        viewable, editable = visible_field_keys(request, module_key, {cfg.field.field_key for cfg in configs})

        # 'role'-type fields don't store their own choices on FieldCatalog —
        # they pull the live list from this tenant's own Role table instead
        # (see core_auth.models.Role), so adding a new role never needs a
        # code change or Superadmin's involvement.
        role_names = None
        if any(cfg.field.data_type == 'role' for cfg in configs):
            role_names = list(Role.objects.values_list('name', flat=True))

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
                'options': role_names if cfg.field.data_type == 'role' else cfg.field.options,
                'readonly': cfg.field.field_key not in editable,
            }
            for cfg in configs
            if cfg.field.field_key in viewable
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
            if tenant.tier == tenant.TIER_TRIAL:
                message = (
                    f'You\'ve reached the {limit}-record limit for {table_key} on the free Trial plan. '
                    f'Upgrade to Enterprise (Complete tier) to add more records.'
                )
            else:
                message = (
                    f'This company has reached its {limit}-record limit for {table_key}. '
                    f'Ask Superadmin to raise this table\'s limit.'
                )
            raise ValidationError(message)

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
