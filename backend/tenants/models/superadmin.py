from django.db import models


class SuperAdminUser(models.Model):
    """Superadmin credentials, kept separate from tenant-scoped Django auth users.
    Passwords must be hashed (use django.contrib.auth.hashers) — never store plaintext."""

    username = models.CharField(max_length=150, unique=True)
    password_hash = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'tenants'

    def __str__(self):
        return self.username
