# Tenant Architecture Platform

Multi-tenant (database-per-tenant) platform. See [command.txt](command.txt) for the
full architecture spec this scaffold implements, and
[DOCUMENTATION.md](DOCUMENTATION.md) for a complete top-to-bottom explanation of
how it works, including the full migration/db-creation/field-sync flow.

## Structure

- `backend/` — Django + DRF, MySQL (MariaDB locally), Swagger via drf-yasg.
- `frontend/` — React (Vite), Tailwind CSS v4 (via `@tailwindcss/vite`), dynamic
  slug-based routing + `/__superadmin`.

## Backend setup

Dependencies are managed with [uv](https://docs.astral.sh/uv/) via `pyproject.toml` /
`uv.lock`. `requirements.txt` is kept only as a plain-`pip` fallback.

```bash
cd backend
uv venv                 # creates .venv (Python 3.12+, required by Django 6.1)
uv sync                 # installs exact versions from uv.lock
cp .env.example .env    # fill in real DB credentials
mysql -u root -p -e "CREATE DATABASE tenant_platform_central CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
uv run python manage.py migrate
uv run python manage.py createsuperuser   # Django admin, not the tenant superadmin
uv run python manage.py runserver
```

Without uv: `pip install -r requirements.txt` and drop the `uv run` prefix.

- API root: `http://localhost:8000/api/`
- Swagger: `http://localhost:8000/swagger/`
- Django admin: `http://localhost:8000/admin/`

### Key pieces

- `tenants/models.py` — `Tenant`, `TenantModule`, `FieldCatalog` (master field list),
  `TenantFieldConfig` (per-tenant field selection), `SuperAdminUser`, `TenantAuditLog`.
- `tenants/middleware.py` — resolves the active tenant from the URL slug per request.
- `tenants/routers.py` + `tenants/context.py` — `DATABASE_ROUTERS` sending
  `employees`/`customers` queries to the resolved tenant DB, central models to `default`.
- `tenants/db_registry.py` — injects new tenant DB connections at runtime.
- `tenants/provisioning.py` — end-to-end onboarding: create DB, migrate, sync fields.
- `tenants/schema_sync.py` — applies a tenant's field selection as real `ADD COLUMN`s
  on its `Employee`/`Customer` tables (e.g. Tata gets 8 columns, Tesla gets 14).
- `tenants/dynamic_models.py` — per-tenant Django model classes so the ORM can
  actually read/write those dynamic columns.
- `manage.py migrate --tenant=<slug>` / `manage.py migrate_all_tenants` —
  per-tenant migrations (see DOCUMENTATION.md §6).
- `core_auth/authentication.py`, `core_auth/permissions.py` — lets a Superadmin
  JWT reach **any** company's `/api/<slug>/employees|customers/`, while a
  tenant-user JWT only works for its own slug; superadmin writes are
  audit-logged (`tenants.audit`).

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

- `/__superadmin` — superadmin login
- `/__superadmin/dashboard` — tenant registry
- `/__superadmin/onboard` — company onboarding form (config form)
- `/__superadmin/companies/<slug>/employees` / `.../customers` — superadmin
  browsing any company's data directly
- `/<company-slug>/login` — tenant-branded login
- `/<company-slug>/dashboard` — tenant dashboard
- `/<company-slug>/employees` / `/<company-slug>/customers` — tenant-scoped
  CRUD, fields rendered dynamically from that tenant's schema

## Not yet wired up (next steps)

- Seed a real `SuperAdminUser` row (hash a password with
  `django.contrib.auth.hashers.make_password` — never store it in plaintext)
  and a first tenant end-user per company (see DOCUMENTATION.md §8.4) — there's
  no signup UI yet.
- Superadmin UI for managing `FieldCatalog` and each tenant's `TenantFieldConfig`
  (the API exists at `/api/superadmin/field-catalog/`; no frontend page yet).
- Tenant suspend/reactivate actions already exist as API endpoints
  (`POST /api/superadmin/tenants/<id>/suspend/`) but have no UI yet.
