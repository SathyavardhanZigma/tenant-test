from rest_framework_simplejwt.authentication import JWTAuthentication


class SuperAdminPrincipal:
    """Stand-in for request.user on a validated superadmin token. Superadmin
    accounts are tenants.models.SuperAdminUser rows, not Django auth.User rows
    (they live in the central DB only, are unrelated to any tenant's own user
    table), so there's no real User instance for JWTAuthentication.get_user()
    to look up via the standard user_id claim."""

    is_authenticated = True
    is_active = True
    is_staff = False
    is_superuser = False

    def __init__(self, username):
        self.username = username

    def __str__(self):
        return self.username


class TenantJWTAuthentication(JWTAuthentication):
    """Extends SimpleJWT's default authentication to also accept superadmin
    tokens, which carry role=superadmin + username but no user_id claim
    (there's no Django auth.User backing a Superadmin account). Tenant-user
    tokens (role=tenant_user, issued via RefreshToken.for_user(...)) still
    resolve through the normal user_id lookup against that tenant's own DB."""

    def get_user(self, validated_token):
        if validated_token.get('role') == 'superadmin':
            return SuperAdminPrincipal(validated_token.get('username', 'superadmin'))
        return super().get_user(validated_token)
