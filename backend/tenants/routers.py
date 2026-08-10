from django.conf import settings

from .context import get_current_tenant_db


class TenantRouter:
    """Routes queries to the right database:

    - settings.TENANT_APPS (employees, customers) — ALWAYS the active tenant DB.
      No tenant context (e.g. a stray query outside a tenant request) falls
      back to 'default' rather than raising, so it fails loudly downstream
      instead of silently.
    - settings.TENANT_SHARED_APPS (auth, contenttypes) — the active tenant DB
      *when a tenant is active* (so each company's end users live in that
      company's own database), otherwise 'default' (so Django admin / the
      Superadmin's own login still work against the central DB, with no
      tenant context set).
    - Everything else — always 'default'.
    """

    def _tenant_alias(self, model):
        app_label = model._meta.app_label
        if app_label in settings.TENANT_APPS:
            return get_current_tenant_db() or 'default'
        if app_label in settings.TENANT_SHARED_APPS:
            return get_current_tenant_db()  # None -> Django's normal ('default') resolution
        return None

    def db_for_read(self, model, **hints):
        return self._tenant_alias(model)

    def db_for_write(self, model, **hints):
        return self._tenant_alias(model)

    def allow_relation(self, obj1, obj2, **hints):
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label in settings.TENANT_APPS:
            return db != 'default'
        if app_label in settings.TENANT_SHARED_APPS:
            return True  # both 'default' (Django admin) and every tenant alias
        return db == 'default'
