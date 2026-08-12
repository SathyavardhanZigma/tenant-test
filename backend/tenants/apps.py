from django.apps import AppConfig


class TenantsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'tenants'

    def ready(self):
        # Every active tenant's DB connection has to be re-registered on
        # every process start (dev autoreload included) — register_tenant_
        # database() only ever runs once, at onboarding time, in whichever
        # process handled that request. Without this, any tenant onboarded
        # before the current process started 500s with ConnectionDoesNotExist.
        from .db_registry import load_all_tenant_databases
        load_all_tenant_databases()
