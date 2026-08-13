import getpass

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError

from tenants.models import SuperAdminUser


class Command(BaseCommand):
    help = (
        'Create or update a SuperAdminUser — the account checked by '
        '/api/auth/superadmin/login/. Unrelated to Django\'s own '
        '`createsuperuser` (auth.User), which this platform\'s superadmin '
        'login does not use.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--username', help='Defaults to prompting interactively.')
        parser.add_argument('--password', help='Defaults to prompting interactively (hidden input).')

    def handle(self, *args, **options):
        username = options['username'] or input('Username: ').strip()
        if not username:
            raise CommandError('Username cannot be blank.')

        password = options['password']
        if not password:
            password = getpass.getpass('Password: ')
            if password != getpass.getpass('Password (again): '):
                raise CommandError('Passwords did not match.')
        if not password:
            raise CommandError('Password cannot be blank.')

        admin, created = SuperAdminUser.objects.update_or_create(
            username=username,
            defaults={'password_hash': make_password(password), 'is_active': True},
        )

        verb = 'Created' if created else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'{verb} superadmin "{admin.username}".'))
