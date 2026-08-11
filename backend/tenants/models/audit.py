from django.db import models

from .tenant import Tenant


class TenantAuditLog(models.Model):
    """Records superadmin actions taken against a tenant's data (impersonation,
    cross-tenant edits, suspensions) for audit purposes."""

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='audit_logs')
    actor = models.CharField(max_length=150, help_text='Superadmin username who performed the action')
    action = models.CharField(max_length=255)
    detail = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'tenants'

    def __str__(self):
        return f'{self.tenant.slug}:{self.action}@{self.created_at:%Y-%m-%d %H:%M}'
