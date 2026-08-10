from django.core.management import call_command
from django.core.management.base import BaseCommand

from tenants.models import Tenant


class Command(BaseCommand):
    help = 'Run `migrate --tenant=<slug>` for every active tenant (use after deploying a migration that must roll out to every company).'

    def handle(self, *args, **options):
        tenants = Tenant.objects.filter(status=Tenant.STATUS_ACTIVE)
        if not tenants:
            self.stdout.write('No active tenants found.')
            return

        for tenant in tenants:
            self.stdout.write(f'Migrating "{tenant.slug}"...')
            call_command('migrate', tenant=tenant.slug)

        self.stdout.write(self.style.SUCCESS(f'Migrated {tenants.count()} tenant(s).'))
