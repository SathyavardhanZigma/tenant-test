from cryptography.fernet import InvalidToken
from django.core.management.base import BaseCommand

from tenants.crypto import decrypt_db_password, encrypt_db_password
from tenants.models import Tenant


class Command(BaseCommand):
    help = ('One-time: encrypt any Tenant.db_password values still stored as plaintext '
            '(from before FIELD_ENCRYPTION_KEY was introduced). Safe to re-run — already '
            'encrypted rows are left untouched.')

    def handle(self, *args, **options):
        updated = 0
        for tenant in Tenant.objects.all():
            try:
                decrypt_db_password(tenant.db_password)
                continue  # already encrypted
            except (InvalidToken, ValueError):
                pass
            tenant.db_password = encrypt_db_password(tenant.db_password)
            tenant.save(update_fields=['db_password'])
            updated += 1
            self.stdout.write(f'Encrypted password for "{tenant.slug}".')

        self.stdout.write(self.style.SUCCESS(f'Done — encrypted {updated} tenant password(s).'))
