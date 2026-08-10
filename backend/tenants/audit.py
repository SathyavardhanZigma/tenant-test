from .models import TenantAuditLog


def log_superadmin_action(tenant, actor, action, detail=None):
    """Records a superadmin action taken directly against a tenant's data
    (impersonation-style cross-tenant edits), per the requirement that any
    such edit must be attributable and auditable."""
    TenantAuditLog.objects.create(tenant=tenant, actor=actor, action=action, detail=detail)
