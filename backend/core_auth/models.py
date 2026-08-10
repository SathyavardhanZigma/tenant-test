# Tenant end-user auth reuses Django's built-in auth.User (created per tenant
# DB by the 'employees'/'customers' tenant migrations, or a dedicated
# tenant_users app if richer per-tenant roles are needed later).
# Superadmin auth is tenants.models.SuperAdminUser, kept in the central DB.
