import secrets

from django.core.management.base import BaseCommand, CommandError
from django.db import connection as default_connection

from tenants.models import Tenant
from tenants.provisioning import _assert_safe_identifier


class Command(BaseCommand):
    help = ('Create a separate, revocable MySQL account scoped to one tenant\'s database '
            '— for handing to a vendor/contractor without exposing the app\'s own live '
            'db_user/db_password. Read-only (SELECT) by default; pass --readwrite for '
            'SELECT/INSERT/UPDATE/DELETE. Never grants DDL.')

    def add_arguments(self, parser):
        parser.add_argument('slug')
        parser.add_argument('--readwrite', action='store_true')

    def handle(self, *args, **options):
        try:
            tenant = Tenant.objects.get(slug=options['slug'])
        except Tenant.DoesNotExist:
            raise CommandError(f'No tenant with slug "{options["slug"]}".')

        db_name = _assert_safe_identifier(tenant.db_name)
        vendor_user = _assert_safe_identifier(f'{tenant.slug}_vendor'[:32])
        vendor_password = secrets.token_urlsafe(24)
        privileges = 'SELECT, INSERT, UPDATE, DELETE' if options['readwrite'] else 'SELECT'

        with default_connection.cursor() as cursor:
            cursor.execute(
                f"CREATE USER IF NOT EXISTS '{vendor_user}'@'%%' IDENTIFIED BY %s",
                [vendor_password],
            )
            cursor.execute(f"GRANT {privileges} ON `{db_name}`.* TO '{vendor_user}'@'%'")
            cursor.execute('FLUSH PRIVILEGES')

        self.stdout.write(self.style.SUCCESS(f'Vendor account ready for "{tenant.slug}":'))
        self.stdout.write(f'  Database: {db_name}')
        self.stdout.write(f'  Username: {vendor_user}')
        self.stdout.write(f'  Password: {vendor_password}')
        self.stdout.write(f'  Access:   {privileges} only, scoped to {db_name} — no DDL, no other database.')
        self.stdout.write(self.style.WARNING(
            'This password is shown once and not stored anywhere — save it now. '
            f'Revoke later with: manage.py revoke_vendor_access {tenant.slug}'
        ))
