from django.db import models

from .tenant import Tenant


class TenantCapability(models.Model):
    """Zigma's per-tenant override of one capability registry entry.

    Deliberately sparse: a row exists only where this tenant differs from the
    registry default, so the table doubles as the drift report ("Erode is 4
    overrides away from our default product"). Absence of a row means "default",
    not "off" — tenants.capabilities.resolve() is the only thing that should
    interpret these, since it also applies parent cascade and settings
    validation.

    `capability_key` is a plain CharField rather than a FK because the registry
    lives in code (see tenants/capabilities.py). A key that disappears from the
    registry in a later release leaves an orphan row here, which resolve()
    simply ignores — cheaper and safer than a migration that deletes tenant
    configuration.
    """

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='capabilities')
    capability_key = models.CharField(max_length=150)
    enabled = models.BooleanField(default=True)
    settings_json = models.JSONField(
        blank=True, null=True,
        help_text="Only keys declared in this capability's settings_schema; "
                  'anything else is dropped on resolve.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'tenants'
        unique_together = ('tenant', 'capability_key')
        ordering = ['capability_key']

    def __str__(self):
        return f'{self.tenant.slug}:{self.capability_key}={self.enabled}'
