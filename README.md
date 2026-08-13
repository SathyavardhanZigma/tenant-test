# Tenant Architecture Platform

Multi-tenant (database-per-tenant) platform: one central database holds the
tenant registry, and every onboarded company gets its own physical MySQL
database, created and torn down at runtime. One React SPA serves both the
superadmin panel and every company's own portal from the same origin.

For the full architecture — diagrams, request-routing mechanism, the
schema-driven CRUD pattern, the dual-session model, and more — see:

- **[backend/ARCHITECTURE.md](backend/ARCHITECTURE.md)** — the multi-tenancy
  machinery: central vs. per-tenant databases, `TenantResolverMiddleware`,
  `DATABASE_ROUTERS`, dynamic per-tenant models, and the onboarding flow.
- **[frontend/ARCHITECTURE.md](frontend/ARCHITECTURE.md)** — the React SPA:
  the superadmin/tenant dual-session model, tenant branding via CSS custom
  properties, the schema-driven `EntityManager` CRUD screen, and the
  onboarding wizard.

This file only covers day-to-day setup.

## Structure

- `backend/` — Django + DRF, MySQL (MariaDB locally), Celery for async tenant
  provisioning, Swagger via drf-yasg.
- `frontend/` — React (Vite), Tailwind CSS v4 (via `@tailwindcss/vite`),
  dynamic slug-based routing + `/__superadmin`.

## Backend setup

Dependencies are managed with [uv](https://docs.astral.sh/uv/) via `pyproject.toml` /
`uv.lock`. `requirements.txt` is kept only as a plain-`pip` fallback.

```bash
cd backend
uv venv                 # creates .venv (Python 3.12+, required by Django 6.1)
uv sync                 # installs exact versions from uv.lock
cp .env.example .env    # fill in real DB credentials
mysql -u root -p -e "CREATE DATABASE tenant_platform_central CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
uv run python manage.py makemigrations  # no-op if models are unchanged — migrations are already committed
uv run python manage.py migrate                # applies tenants/core_auth/auth/contenttypes to the central DB only
uv run python manage.py seed_field_catalog     # seeds the master Employee/Customer field list
uv run python manage.py create_superadmin      # creates the tenant-registry superadmin login
uv run python manage.py runserver
```

`makemigrations`/`migrate` here only ever touch the **central** database — `employees`/`customers`
are tenant-scoped apps (`TENANT_APPS` in `config/settings.py`) that `TenantRouter` routes away from
`default`, so they only get migrated into a company's own database, as part of onboarding
(`tenants/provisioning.py`) or via `manage.py migrate_all_tenants` afterwards.

Without uv: `pip install -r requirements.txt` and drop the `uv run` prefix.

**Also start a Celery worker** — tenant onboarding provisions each new
company's database as an async Celery task; without a worker consuming the
queue, new companies get stuck at "Provisioning..." forever:

```bash
cd backend
celery -A config worker --loglevel=info
```

(Redis must be running locally as the broker — `CELERY_BROKER_URL` in
`.env` defaults to `redis://localhost:6379/0`. For quick local testing
without a separate worker process, set `CELERY_TASK_ALWAYS_EAGER=True` in
`.env` instead, which runs provisioning synchronously in-process.)

- API root: `http://localhost:8000/api/`
- Swagger: `http://localhost:8000/swagger/`
- Django admin: `http://localhost:8000/admin/` — this is a **separate**
  login from the tenant-registry superadmin above; `manage.py createsuperuser`
  only creates a Django `auth.User` for this page, not a `SuperAdminUser` row.

### Key pieces (see [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md) for the full picture)

- `tenants/models/` — `Tenant`, `TenantModule`, `FieldCatalog` (master field
  list), `TenantFieldConfig` (per-tenant field selection), `TenantTableLimit`,
  `SuperAdminUser`, `TenantAuditLog`.
- `tenants/middleware.py` — resolves the active tenant from the URL slug (or
  `X-Tenant` header) per request; exempts superadmin, docs, and `/media` paths.
- `tenants/routers.py` + `tenants/context.py` — `DATABASE_ROUTERS` sending
  `employees`/`customers` queries to the resolved tenant DB, central models to `default`.
- `tenants/db_registry.py` — injects new tenant DB connections at runtime.
- `tenants/provisioning.py` + `tenants/tasks.py` — end-to-end onboarding
  (create DB, migrate, sync fields), the DB-mutating half running as a
  Celery task so the onboarding request returns immediately. Each tenant
  gets its own generated MySQL username/password
  (`generate_tenant_db_credentials`), scoped by `GRANT` to only that
  tenant's own database — not the central admin credentials from `.env`.
  The central `DB_USER` (`root` locally) needs `CREATE`, `CREATE USER`, and
  `GRANT OPTION` privileges for this to work. `Tenant.db_password` is
  encrypted at rest (`tenants/crypto.py`, `FIELD_ENCRYPTION_KEY` in `.env`)
  — reversible, not hashed, since the app must recover the real password to
  authenticate. A tenant's own account is **DML-only** (`SELECT`/`INSERT`/
  `UPDATE`/`DELETE`) at rest, so manual access via phpMyAdmin/DBeaver/`mysql`
  can never `CREATE`/`ALTER`/`DROP` a table — only server-initiated,
  superadmin-gated code (initial provisioning, module/field toggles) briefly
  elevates it via `tenant_ddl_privileges()`, then always downgrades it back.
- `tenants/schema_sync.py` — applies a tenant's field selection as real
  `ADD COLUMN`/`DROP COLUMN`s on its `Employee`/`Customer` tables (e.g. Tata
  gets 8 columns, Tesla gets 14).
- `tenants/dynamic_models.py` — per-tenant, unmanaged Django model classes so
  the ORM can actually read/write those dynamic columns.
- `tenants/management/commands/` — `seed_field_catalog` (master field list),
  `create_superadmin` (tenant-registry login), `migrate_all_tenants`
  (per-tenant migrations).
- `core_auth/authentication.py`, `core_auth/permissions.py` — lets a
  Superadmin JWT reach **any** company's `/api/<slug>/employees|customers/`,
  while a tenant-user JWT only works for its own slug; superadmin writes are
  audit-logged (`tenants.audit`).

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

- `/__superadmin` — superadmin login
- `/__superadmin/dashboard` — tenant registry (Companies table)
- `/__superadmin/onboard` — 5-step company onboarding wizard (Company →
  Modules → Tier & Plan → Limits → Fields)
- `/__superadmin/field-catalog` — manage the master Employee/Customer field list
- `/__superadmin/companies/<slug>/{employees,customers,fields,users,limits}` —
  superadmin managing/browsing any company's data and config directly
- `/<company-slug>/login` — tenant-branded login (colors/logo pulled live
  from that company's settings)
- `/<company-slug>/dashboard` — tenant dashboard
- `/<company-slug>/employees` / `/<company-slug>/customers` — tenant-scoped
  CRUD, fields rendered dynamically from that tenant's schema

Superadmin and a company's own login can be active in the same browser at
once — sessions are namespaced separately (see "Session model" in
[frontend/ARCHITECTURE.md](frontend/ARCHITECTURE.md)).

## Giving a vendor/contractor access to one tenant's database

Never hand over a tenant's own `db_user`/`db_password` — that's the exact
credential the live app depends on for that tenant; if a vendor changes its
password or breaks something, that tenant's app connection breaks too.
Instead, create a separate, revocable account scoped to just that tenant's
database:

```bash
cd backend
.venv/bin/python3 manage.py create_vendor_access <slug>              # read-only (SELECT)
.venv/bin/python3 manage.py create_vendor_access <slug> --readwrite   # + INSERT/UPDATE/DELETE
```

The generated username/password is printed once (never stored) — copy it
immediately and send it to the vendor along with your phpMyAdmin/DBeaver URL.
When the engagement ends:

```bash
.venv/bin/python3 manage.py revoke_vendor_access <slug>
```

Note: a URL like `http://192.168.x.x/phpmyadmin/...` is only reachable from
the same LAN — a genuinely remote vendor needs port-forwarding, a VPN, or a
tunnel first.

## Not yet wired up (next steps)

- Tenant suspend/reactivate already exist as API endpoints
  (`POST /api/superadmin/tenants/<id>/suspend/` / `.../reactivate/`) and as
  `tenantsService.suspend`/`.reactivate` on the frontend, but no button calls
  them yet from the Companies dashboard.


mysql -u root -p'admin@123' -e "SELECT slug, db_name, db_host, db_port, db_user, db_password FROM tenants_tenant WHERE slug='test';" tenant_platform_central


 mysql -u tenant_test -p'a_fMnktvahlp2dvqfcORiTblc6WiZa9h' -h localhost tenant_test -e "SHOW TABLES;"
