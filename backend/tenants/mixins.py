from rest_framework.decorators import action
from rest_framework.response import Response

from .audit import log_superadmin_action


class TenantEntityViewSetMixin:
    """Shared behaviour for tenant-scoped Employee/Customer viewsets:
    - GET .../schema/ — the tenant's enabled field list (key/label/type/required),
      used by the frontend to render dynamic forms/tables without hardcoding fields.
    - Audit logging whenever a Superadmin (as opposed to a tenant user) mutates
      a tenant's data directly, per the cross-tenant-edit auditing requirement.

    Subclasses must set `entity` ('employee' or 'customer') and implement
    `get_queryset`/`get_serializer_class` as usual.
    """

    entity = None

    @action(detail=False, methods=['get'])
    def schema(self, request, **kwargs):
        configs = request.tenant.field_configs.select_related('field').filter(
            enabled=True, field__entity=self.entity,
        ).order_by('order')
        return Response([
            {
                'key': cfg.field.field_key,
                'label': cfg.field.label,
                'data_type': cfg.field.data_type,
                'required': cfg.is_required,
                'options': cfg.field.options,
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
        instance = serializer.save()
        self._maybe_audit('create', instance.pk)

    def perform_update(self, serializer):
        instance = serializer.save()
        self._maybe_audit('update', instance.pk)

    def perform_destroy(self, instance):
        pk = instance.pk
        instance.delete()
        self._maybe_audit('delete', pk)
