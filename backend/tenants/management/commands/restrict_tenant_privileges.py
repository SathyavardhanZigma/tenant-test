from django.conf import settings
from django.core.management.base import BaseCommand

from tenants.models import Tenant
from tenants.provisioning import _set_tenant_privileges


class Command(BaseCommand):
    help = ('One-time: downgrade every tenant\'s own MySQL account (tenant.db_user) to '
            'DML-only (SELECT/INSERT/UPDATE/DELETE) — for tenants provisioned before this '
            'restriction existed and still holding ALL PRIVILEGES. Safe to re-run.')

    def handle(self, *args, **options):
        # Legacy tenants provisioned before per-tenant credentials existed
        # still have db_user set to the central admin's own username — never
        # touch that account's privileges (see create_vendor_access for how
        # to onboard those onto a dedicated credential first).
        central_admin_user = settings.DATABASES['default']['USER']

        count = 0
        for tenant in Tenant.objects.all():
            if tenant.db_user == central_admin_user:
                self.stdout.write(self.style.WARNING(
                    f'Skipping "{tenant.slug}" — still using the central admin '
                    f'credential ({tenant.db_user}), not a dedicated tenant account.'
                ))
                continue
            _set_tenant_privileges(tenant, 'SELECT, INSERT, UPDATE, DELETE')
            self.stdout.write(f'Restricted "{tenant.slug}" ({tenant.db_user}) to DML-only.')
            count += 1
        self.stdout.write(self.style.SUCCESS(f'Done — restricted {count} tenant(s).'))
