from django.core.management.base import BaseCommand, CommandError
from django.db import connection as default_connection

from tenants.models import Tenant
from tenants.provisioning import _assert_safe_identifier


class Command(BaseCommand):
    help = 'Drop a vendor MySQL account created by create_vendor_access for the given tenant slug.'

    def add_arguments(self, parser):
        parser.add_argument('slug')

    def handle(self, *args, **options):
        try:
            tenant = Tenant.objects.get(slug=options['slug'])
        except Tenant.DoesNotExist:
            raise CommandError(f'No tenant with slug "{options["slug"]}".')

        vendor_user = _assert_safe_identifier(f'{tenant.slug}_vendor'[:32])
        with default_connection.cursor() as cursor:
            cursor.execute(f"DROP USER IF EXISTS '{vendor_user}'@'%'")
            cursor.execute('FLUSH PRIVILEGES')

        self.stdout.write(self.style.SUCCESS(f'Revoked vendor access for "{tenant.slug}" ({vendor_user}).'))
