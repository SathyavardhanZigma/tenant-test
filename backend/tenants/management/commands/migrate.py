from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.core.management.commands.migrate import Command as CoreMigrateCommand

from tenants.db_registry import register_tenant_database
from tenants.models import Tenant


class Command(CoreMigrateCommand):
    """Extends Django's built-in `migrate` with a `--tenant=<slug>` flag,
    instead of a separate custom command name:

        python manage.py migrate                  # central DB, exactly stock Django
        python manage.py migrate --tenant=tata     # only tata's own database
        python manage.py migrate employees --tenant=tata   # one app, one tenant

    `--tenant` only ever touches settings.TENANT_APPS + TENANT_SHARED_APPS
    (employees, customers, auth, contenttypes) — central-only apps (admin,
    sessions, tenants itself) are never migrated onto a tenant alias, per
    tenants.routers.TenantRouter.allow_migrate.
    """

    def add_arguments(self, parser):
        super().add_arguments(parser)
        parser.add_argument(
            '--tenant', metavar='SLUG', default=None,
            help="Company slug to migrate instead of the central database. "
                 "Restricted to settings.TENANT_APPS/TENANT_SHARED_APPS.",
        )

    def handle(self, *args, **options):
        tenant_slug = options.pop('tenant', None)
        if not tenant_slug:
            return super().handle(*args, **options)

        try:
            tenant = Tenant.objects.get(slug=tenant_slug)
        except Tenant.DoesNotExist:
            raise CommandError(f'No tenant with slug "{tenant_slug}"')

        register_tenant_database(tenant)

        app_label = options.get('app_label')
        migration_name = options.get('migration_name')
        verbosity = options.get('verbosity', 1)

        allowed_apps = set(settings.TENANT_SHARED_APPS) | set(settings.TENANT_APPS)
        if app_label and app_label not in allowed_apps:
            raise CommandError(
                f'"{app_label}" is not a tenant app — only {sorted(allowed_apps)} '
                f'can be migrated with --tenant.'
            )

        # TENANT_SHARED_APPS (auth, contenttypes) first — employees/customers
        # don't depend on them, but keeping the dependency order explicit
        # avoids relying on migration-graph ordering across separate calls.
        apps_to_migrate = [app_label] if app_label else list(settings.TENANT_SHARED_APPS) + list(settings.TENANT_APPS)

        for app in apps_to_migrate:
            call_command_args = [app, migration_name] if (app_label and migration_name) else [app]
            call_command('migrate', *call_command_args, database=tenant_slug, verbosity=verbosity)

        self.stdout.write(self.style.SUCCESS(f'Migrated tenant "{tenant_slug}" ({tenant.company_name})'))
