from django.apps import AppConfig


class TenantsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'tenants'

    def ready(self):
        import sys

        if not any(cmd in sys.argv for cmd in ('runserver', 'shell', 'shell_plus')):
            return

        from .db_registry import load_all_tenant_databases

        load_all_tenant_databases()
