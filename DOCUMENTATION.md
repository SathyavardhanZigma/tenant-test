# Tenant Architecture — Full Project Documentation

This document explains how the whole system works end to end: the architecture,
the request lifecycle, the database model, and the exact commands to create,
migrate, and provision databases.

For the original requirements this implements, see [command.txt](command.txt).

---

## 1. The core idea

This is a **database-per-tenant** multi-tenant platform. Every company ("tenant")
that signs up gets:

- Its own row in a central registry (company name, slug, owner, logo, status).
- Its own **physical MySQL database** (e.g. `tenant_tata`, `tenant_tesla`).
- Its own `Employee` / `Customer` tables, whose *columns* can differ per company —
  Tata might have 8 employee fields, Tesla might have 14, both drawn from the same
  Superadmin-controlled master list.

A single Django process serves every tenant. Which physical database a request
hits is decided **per request**, at runtime, based on the company slug in the URL.

There are two databases at play conceptually:

| | Central DB (`default`) | Tenant DB (`tenant_<slug>`) |
|---|---|---|
| Holds | `Tenant`, `TenantModule`, `FieldCatalog`, `TenantFieldConfig`, `SuperAdminUser`, `TenantAuditLog` | `Employee`, `Customer`, tenant's own auth users |
| Who writes to it | Superadmin actions, provisioning | Tenant's own users, tenant-scoped API calls |
| Created | Once, up front (`tenant_platform_central`) | Dynamically, one per company, at onboarding time |

---

## 2. Project layout

```
tenant-achitecture/
├── command.txt                 # original requirements spec
├── DOCUMENTATION.md             # this file
├── README.md                    # quick-start setup
├── backend/                      # Django + DRF
│   ├── config/                   # project settings, root urls
│   ├── tenants/                   # central registry + provisioning + routing
│   ├── employees/                 # tenant-scoped Employee model/API
│   ├── customers/                 # tenant-scoped Customer model/API
│   ├── core_auth/                 # superadmin login + tenant login
│   └── modules/                   # placeholder for future selectable modules
└── frontend/                     # React (Vite)
    └── src/
        ├── pages/                 # login/dashboard/onboarding screens
        ├── context/TenantContext.jsx
        └── api/client.js
```

---

## 3. Backend apps and what they own

### `tenants` — the control plane

This app owns everything central-DB and everything that makes multi-tenancy work:

- **`models.py`**
  - `Tenant` — one row per company: name, slug, owner, logo, DB connection
    details (`db_name`, `db_host`, `db_port`, `db_user`, `db_password`), status
    (`active`/`suspended`).
  - `TenantModule` — which optional modules (`employees`, `customers`,
    `inventory`, ...) a tenant has turned on.
  - `FieldCatalog` — the **master list** of every Employee/Customer field
    Superadmin has ever defined (e.g. 14 possible employee fields).
  - `TenantFieldConfig` — per-tenant, per-field: is this field enabled for this
    company, is it required, what order does it show in. This is how Tata ends
    up with 8 fields and Tesla with 14 — same catalog, different selection.
  - `SuperAdminUser` — separate from Django's normal `auth.User`; lives only in
    the central DB; password is a hash (`django.contrib.auth.hashers`), never
    plaintext.
  - `TenantAuditLog` — records superadmin actions taken against a tenant (for
    accountability when superadmin edits a company's data directly).

- **`middleware.py`** — `TenantResolverMiddleware`. Runs on every request,
  figures out which company the request is for, and rejects/redirects if that
  company doesn't exist or is suspended. See §4.

- **`context.py`** — a `contextvar` holding "which tenant DB alias is active for
  *this* request right now." Needed because Django's `DATABASE_ROUTERS` don't
  get direct access to the request object.

- **`routers.py`** — `TenantRouter`. Consulted by Django on every query to
  decide which physical database it should run against. See §5.

- **`db_registry.py`** — functions that inject a tenant's DB connection info
  into Django's live connection pool at runtime (since `settings.DATABASES` is
  normally fixed at startup).

- **`provisioning.py`** — `provision_tenant(...)`, the function that runs when a
  new company signs up: creates the MySQL database, registers its connection,
  runs its migrations, and syncs its field schema. See §7.

- **`schema_sync.py`** — `sync_tenant_schema(tenant)`. Compares a tenant's
  `TenantFieldConfig` selection against the actual columns in its
  `Employee`/`Customer` tables and adds whichever are missing. See §8.

- **`management/commands/migrate.py`** — extends Django's own `migrate` with a
  `--tenant=<slug>` flag, and **`migrate_all_tenants.py`** — runs it for every
  active tenant. See §6.

### `employees` / `customers` — tenant-scoped data

- `models.py` — deliberately minimal: `id`, `created_at`, `updated_at`. All the
  company-specific columns (name, department, PAN number, whatever Tata/Tesla
  chose) are added **dynamically** by `schema_sync.py`, not hardcoded here.
- `serializers.py` — `build_dynamic_employee_serializer(tenant)` /
  `build_dynamic_customer_serializer(tenant)` build a DRF serializer *at request
  time*, with exactly the fields that tenant has enabled.
- `views.py` — the `ViewSet`s use `Model.objects.using(request.tenant.slug)` to
  force the query onto the right tenant DB (belt-and-suspenders on top of the
  router), and call the dynamic serializer builder for `get_serializer_class`.

### `core_auth` — authentication

- `SuperAdminLoginView` — checks credentials against `SuperAdminUser` in the
  central DB, issues a JWT tagged `role: superadmin`.
- `TenantLoginView` — checks credentials against the tenant DB that
  `TenantResolverMiddleware` already resolved onto `request.tenant`, issues a
  JWT tagged with `tenant_slug`.

### `config` — project wiring

- `settings.py` — `DATABASES['default']` (MySQL/MariaDB via `PyMySQL`),
  `DATABASE_ROUTERS`, `TENANT_APPS = ['employees', 'customers']`,
  `INSTALLED_APPS`, DRF/Swagger config, CORS.
- `urls.py` — the grouped URL structure (see §9).

---

## 4. Request lifecycle (what happens on every API call)

```
Browser → /api/tata/employees/
              │
              ▼
   TenantResolverMiddleware
      1. Not in the exempt list (/__superadmin, /admin, /swagger, ...)
      2. Extracts slug "tata" from the path (or X-Tenant header)
      3. Looks up Tenant.objects.get(slug="tata")
         - 404 if it doesn't exist
         - 403 if tenant.status == "suspended"
      4. set_current_tenant(tenant, "tata")  → stored in a contextvar
      5. request.tenant = tenant
              │
              ▼
        View / ViewSet runs
      EmployeeViewSet.get_queryset()
        → Employee.objects.using("tata").all()
      EmployeeViewSet.get_serializer_class()
        → build_dynamic_employee_serializer(request.tenant)
              │
              ▼
        Django ORM issues the query
      TenantRouter.db_for_read/db_for_write
        → app_label "employees" is in TENANT_APPS
        → returns get_current_tenant_db() == "tata"
        → query runs against the tenant_tata MySQL database
              │
              ▼
      clear_current_tenant()   (in the middleware's `finally`)
      response returned
```

Two independent things point at "tata" here — the explicit `.using("tata")` in
the view, and the router reading the contextvar. Either alone would be enough;
having both means a stray query that forgets `.using(...)` still lands on the
correct tenant DB via the router.

Routes exempt from this whole flow (`/__superadmin`, `/api/superadmin`, `/admin`,
`/swagger`, `/redoc`) go straight through — they only ever touch the central DB.

---

## 5. How the database router decides where a query goes

`tenants/routers.py`:

```python
class TenantRouter:
    def _tenant_alias(self, model):
        if model._meta.app_label not in settings.TENANT_APPS:   # employees, customers
            return None                                          # → falls back to 'default'
        return get_current_tenant_db() or 'default'

    def db_for_read(self, model, **hints):  return self._tenant_alias(model)
    def db_for_write(self, model, **hints): return self._tenant_alias(model)

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label in settings.TENANT_APPS:
            return db != 'default'   # tenant apps never migrate onto 'default'
        return db == 'default'      # central apps only ever migrate onto 'default'
```

This is why `python manage.py migrate` against `default` silently skips creating
`employees_employee` / `customers_customer` tables there — `allow_migrate`
returns `False` for those, so Django records the migration as "applied" (so it
doesn't keep retrying) but performs no actual schema change on the central DB.

---

## 6. Migrations — `makemigrations`, and `migrate` with an optional `--tenant`

Django's migration system doesn't know about "tenants" out of the box, so this
project extends the standard commands rather than bolting on new ones:

### a) `python manage.py makemigrations`

Run this whenever you change a model (add a field to `Employee`, add a new
model to `tenants`, etc). It writes migration files under
`<app>/migrations/000N_*.py`. This is identical to any normal Django project —
it doesn't touch any database, it just diffs your models against the last
migration file.

```bash
uv run python manage.py makemigrations            # all apps
uv run python manage.py makemigrations tenants     # just one app
```

### b) `python manage.py migrate` (no `--tenant`)

Applies migrations to the **central `default` DB only** — behaves exactly
like stock Django. Because of `allow_migrate`, this only actually creates
tables for central-only apps (`tenants`, `admin`, `sessions`) plus
`TENANT_SHARED_APPS` (`auth`, `contenttypes`, which also migrate onto
`default` for Django admin — see §8.4). Run this once, at initial setup, and
again any time you add a migration to `tenants`.

```bash
uv run python manage.py migrate
```

### c) `python manage.py migrate --tenant=<slug>`

`tenants/management/commands/migrate.py` subclasses Django's own `migrate`
command and adds a `--tenant` flag — there's no separate command name to
remember, it's the same `migrate` you already know:

```bash
uv run python manage.py migrate --tenant=tata                  # every tenant app, onto tata's DB
uv run python manage.py migrate employees --tenant=tata         # just one app
uv run python manage.py migrate tenants --tenant=tata           # error: 'tenants' isn't a tenant app
```

Internally: looks up the `Tenant` row, calls `register_tenant_database(tenant)`
to make sure that DB connection is live, then re-invokes stock `migrate`
(`call_command('migrate', app_label, database=slug)`) once per app in
`settings.TENANT_SHARED_APPS + TENANT_APPS`. Passing an app label outside that
set raises a `CommandError` rather than silently doing nothing — central-only
apps (`tenants`, `admin`, `sessions`) can never be migrated onto a tenant
alias, per `TenantRouter.allow_migrate` (§5).

### d) `python manage.py migrate_all_tenants`

Loops over every `active` tenant and runs `migrate --tenant=<slug>` for each.
Use this after you ship a new migration to `employees`/`customers` that needs
to roll out to every existing company:

```bash
uv run python manage.py migrate_all_tenants
```

### When each one fires, in practice

| Situation | Command |
|---|---|
| First-ever setup of the project | `migrate` (creates central tables) |
| You add a field to the `Tenant` model | `makemigrations tenants` → `migrate` |
| You add a field to the `Employee` model that should exist for every company | `makemigrations employees` → `migrate_all_tenants` |
| A brand-new company signs up | Nothing manual — `provision_tenant()` calls `migrate --tenant=<slug>` automatically (see §7) |
| Superadmin changes which fields Tata has enabled | Nothing manual — this isn't a migration at all, it's `schema_sync.sync_tenant_schema()` (see §8), which does raw `ADD COLUMN`, no migration file involved |

---

## 7. Database creation — what happens when a company signs up

This is `tenants/provisioning.py: provision_tenant(...)`, triggered by
`POST /api/superadmin/tenants/` (the config form). Step by step:

1. **Validate & register.** A `Tenant` row is created in the central DB —
   company name, slug, owner, logo, and DB credentials (defaults to
   `tenant_<slug>` as the DB name, and the same MySQL user/password as the
   central connection unless overridden).

2. **Create the physical database.**
   ```python
   cursor.execute(
       f'CREATE DATABASE IF NOT EXISTS `{db_name}` '
       f'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
   )
   ```
   Run on the *central* connection, which must have `CREATE` privileges. Because
   `db_name` always comes from a validated `SlugField`, there's no SQL-injection
   risk in building this string directly.

3. **Register the connection.** `register_tenant_database(tenant)` adds an entry
   to `settings.DATABASES[tenant.slug]` and `connections.databases[tenant.slug]`
   with the MySQL engine, host/port/user/password, and all the defaults Django
   normally fills in for DBs declared at startup (`TIME_ZONE`, `CONN_MAX_AGE`,
   `TEST`, etc — this project injects them explicitly since the alias didn't
   exist when Django started).

4. **Run tenant migrations.** `call_command('migrate', tenant=tenant.slug)` —
   creates `employees_employee`, `customers_customer`, `auth_user`, etc. inside
   the new database, with just the core columns (`id`, `created_at`, `updated_at`).

5. **Enable selected modules.** Creates a `TenantModule` row for each
   `module_key` the onboarding form submitted.

6. **Sync field schema.** `sync_tenant_schema(tenant)` — see §8. Adds the
   tenant's chosen Employee/Customer columns on top of the core table.

On process startup, `TenantsConfig.ready()` (in `tenants/apps.py`) calls
`load_all_tenant_databases()`, which loads every *existing* active tenant's
connection back into `settings.DATABASES` — so after a server restart, all
previously provisioned tenant DBs are immediately reachable again without
re-running provisioning.

### Doing it manually (for testing/debugging)

```bash
uv run python manage.py shell
```
```python
from tenants.provisioning import provision_tenant
provision_tenant(
    company_name="Tata", slug="tata",
    owner_name="Ratan", owner_email="owner@tata.example.com",
    module_keys=["employees"],
)
```

---

## 8. Field-level schema — how Tata ends up with 8 fields and Tesla with 14

This is the mechanism from the original spec: Superadmin defines a **master
catalog** of possible fields once; each company picks a subset.

1. Superadmin populates `FieldCatalog` (central DB) — e.g. 14 rows for
   `entity='employee'`: `emp_code`, `first_name`, `department`, `salary`, ...
   each with a `data_type` (`string`, `integer`, `date`, `boolean`, `enum`,
   `email`, `text`).

2. For a given tenant, Superadmin (via the onboarding form or a later edit)
   creates `TenantFieldConfig` rows: `(tenant=tata, field=emp_code, enabled=True,
   order=0)`, and so on — only for the fields that tenant wants.

3. `sync_tenant_schema(tenant)` (`tenants/schema_sync.py`) runs a real
   `ALTER TABLE ... ADD COLUMN` directly against the tenant's MySQL database
   for each newly-enabled field — **not** a Django migration file. That's
   deliberate: with dozens of tenants each with a different column set, one
   migration file per tenant per field change doesn't scale. The "schema" for
   `Employee`/`Customer` is data (`TenantFieldConfig` rows), and
   `sync_tenant_schema` is the thing that makes the real table match that data.

4. At request time, the ORM needs a Python model class that actually declares
   those columns to query/write them — see §8.1.

**Disabling** a field currently leaves its column in place (soft-hide — the
dynamic model/serializer just won't expose it) rather than dropping data.
Hard-deleting a column is a deliberate manual step, not something
`sync_tenant_schema` does automatically.

### 8.1 Why a plain `ModelSerializer` isn't enough — dynamic model classes

The Django ORM can only SELECT/INSERT/UPDATE fields that are *declared* on a
Model class — it can't discover "whatever columns happen to exist" in a table
on its own. `employees/models.py:Employee` only declares `id`, `created_at`,
`updated_at` (its migration-owned core columns); it says nothing about
`first_name` or `is_manager`, even after `sync_tenant_schema` adds those
columns to the actual MySQL table.

So `tenants/dynamic_models.py: get_dynamic_model(entity, tenant)` builds a
**per-tenant Model subclass** at runtime:

```python
attrs = {'created_at': ..., 'updated_at': ...}
for cfg in tenant.field_configs.filter(enabled=True, field__entity=entity):
    attrs[cfg.field.field_key] = build_model_field(cfg.field.data_type)
attrs['Meta'] = type('Meta', (), {
    'db_table': Employee._meta.db_table,  # same physical table
    'app_label': 'employees',
    'managed': False,                     # sync_tenant_schema owns the schema, not `migrate`
})
model = type(f'Employee_{tenant.slug}_{hash(field_keys)}', (models.Model,), attrs)
```

This class points at the *same physical table* as the static `Employee`
model, but declares exactly the fields Tata (or Tesla) has enabled, each with
its real type (`BooleanField`, `IntegerField`, `DateField`, ...). Classes are
cached per `(entity, tenant slug, sorted field keys)` — Django's app registry
doesn't allow re-registering the same model name twice, and the field set
only changes when Superadmin edits `TenantFieldConfig`.

`employees/views.py` and `employees/serializers.py` then use this dynamic
class instead of the static one:

```python
def get_queryset(self):
    model = get_dynamic_model('employee', self.request.tenant)
    return model.objects.using(self.request.tenant.slug).all()

def get_serializer_class(self):
    model = get_dynamic_model('employee', self.request.tenant)
    return type('DynamicEmployeeSerializer', (serializers.ModelSerializer,),
                {'Meta': type('Meta', (), {'model': model, 'fields': '__all__'})})
```

Because `ModelSerializer` reads field types straight off the model,
`is_manager` correctly becomes a `BooleanField` on the serializer, `salary`
becomes an `IntegerField`, etc. — no manual per-data-type serializer-building
code needed, and list/retrieve/create/update/delete all work exactly like a
normal Django app, just against a table shape decided at runtime.

### 8.2 GET .../schema/ — how the frontend knows what fields exist

`tenants/mixins.py: TenantEntityViewSetMixin` adds a `schema` action to both
`EmployeeViewSet` and `CustomerViewSet`:

```
GET /api/<slug>/employees/schema/
GET /api/<slug>/customers/schema/
```

returning `[{key, label, data_type, required, options}, ...]` for that
tenant's enabled fields. The React `EntityManager` component
(`frontend/src/pages/EntityManager.jsx`) fetches this once and uses it to
render both the create form and the list table dynamically — it never
hardcodes a field name, so it works unmodified for Tata's 8 fields, Tesla's
14, or any other combination.

### 8.3 Authentication: two kinds of JWT, one Employee/Customer endpoint

There are two independent login flows, and both end up producing a JWT that
`GET/POST /api/<slug>/employees/` accepts — this is what lets Superadmin open
*any* company's data through the exact same API tenant users use.

- **Tenant user** (`core_auth.views.TenantLoginView`) — `authenticate()` runs
  against `request.tenant`'s own database (see §8.4), then
  `RefreshToken.for_user(user)` mints a token carrying a normal `user_id`
  claim plus `role: tenant_user` and `tenant_slug: <slug>`.
- **Superadmin** (`core_auth.views.SuperAdminLoginView`) — checks
  `tenants.models.SuperAdminUser` (central DB only, hashed password). Since a
  `SuperAdminUser` is **not** a Django `auth.User`, there's no real user row
  to attach a `user_id` claim to — the token only carries `role: superadmin`
  and `username`.

DRF's stock `JWTAuthentication.get_user()` requires a `user_id` claim and
would reject a superadmin token outright. `core_auth/authentication.py:
TenantJWTAuthentication` (installed as `DEFAULT_AUTHENTICATION_CLASSES`)
overrides `get_user()` to special-case `role: superadmin` tokens, returning a
lightweight `SuperAdminPrincipal` stand-in instead of a real `User` — enough
to satisfy DRF's authenticated-request plumbing without pretending Superadmin
is a tenant's Django user.

Both `EmployeeViewSet` and `CustomerViewSet` use
`core_auth.permissions.IsTenantUserOrSuperAdmin`:

```python
def has_permission(self, request, view):
    role = request.auth.get('role')
    if role == 'superadmin':
        return True
    if role == 'tenant_user':
        return request.auth.get('tenant_slug') == request.tenant.slug
    return False
```

A tenant user's token only ever passes for the one `tenant_slug` baked into
it at login — Tesla's user gets `403` on `/api/tata/employees/`. A superadmin
token passes for **every** slug, which is what makes cross-company access
work: hit `/api/tata/employees/` and `/api/tesla/employees/` with the same
superadmin token, and the `TenantResolverMiddleware` + `TenantRouter`
machinery from §4–§5 takes care of pointing each request at the right
physical database — no special-casing needed beyond the permission check.

Similarly, `tenants.views.IsSuperAdmin` (used by the tenant registry,
field-catalog, and per-tenant field-config endpoints under
`/api/superadmin/...`) checks `request.auth.get('role') == 'superadmin'`
directly, rather than any Django `is_staff`/`is_superuser` flag — those don't
apply to `SuperAdminPrincipal` at all.

**Auditing.** Every create/update/delete a superadmin performs against a
tenant's Employee/Customer data is logged: `tenants.mixins.
TenantEntityViewSetMixin._maybe_audit` checks `request.auth.get('role')` and,
if it's `superadmin`, writes a `TenantAuditLog` row (`tenants/audit.py:
log_superadmin_action`) recording the actor, the action (`create_employee`,
`update_customer`, ...), and the affected row's id. Tenant users' own writes
are not logged this way — only cross-tenant superadmin edits are, per the
"any such edit must be attributable" requirement.

### 8.4 Tenant users live in the tenant's own database, too

`TenantLoginView` authenticates against `request.tenant`'s database, not the
central one — which means `auth.User` rows for tenant end-users must actually
exist there. `auth` (and `contenttypes`, which `auth.Permission` depends on)
are declared as `settings.TENANT_SHARED_APPS`, migrated onto **both** the
central DB (for Django admin / the `createsuperuser` account) **and** every
tenant DB (`migrate --tenant=<slug>` runs `TENANT_SHARED_APPS + TENANT_APPS`). The
router (§5) sends `auth`/`contenttypes` queries to whichever tenant is
active in the current request's context, falling back to `default` when no
tenant context is set (Django admin, Superadmin's own login). Practically:
Tata and Tesla each have their own completely separate `auth_user` table —
creating a user in one never makes it valid in the other.

To create a tenant's first user today (there's no signup UI yet):

```bash
uv run python manage.py shell
>>> from django.contrib.auth.hashers import make_password
>>> from django.contrib.auth.models import User
>>> User.objects.using('tata').create(username='alice', password=make_password('a-real-password'))
```

---

## 9. URL structure (grouped, and mirrored in Swagger)

```
/admin/                                  Django admin (central DB only)
/swagger/, /redoc/                       API docs

/api/auth/superadmin/login/              Superadmin login (central DB)
/api/superadmin/tenants/                 Tenant registry CRUD (superadmin only)
/api/superadmin/tenants/<id>/suspend/    Suspend a tenant
/api/superadmin/tenants/<id>/reactivate/ Reactivate a tenant
/api/superadmin/field-catalog/           Manage the master FieldCatalog

/api/<slug>/auth/login/                  Tenant user login
/api/<slug>/public-info/                 Public branding (name/logo) — no auth
/api/<slug>/employees/                   Tenant-scoped Employee CRUD
/api/<slug>/employees/schema/            That tenant's enabled Employee fields
/api/<slug>/customers/                   Tenant-scoped Customer CRUD
/api/<slug>/customers/schema/            That tenant's enabled Customer fields
```

Note that `/api/<slug>/employees/` and `/api/<slug>/customers/` are reachable
with either a tenant-user JWT (only for that one `slug`) or a superadmin JWT
(for any `slug`) — see §8.3.

Each app registers its own DRF `DefaultRouter` (`tenants/urls.py`,
`employees/urls.py`, `customers/urls.py`), and `config/urls.py` assembles them
under the prefixes above. `drf-yasg`'s Swagger UI at `/swagger/` picks up this
same grouping automatically from the router structure.

---

## 10. Frontend routing (mirrors the backend's tenant/superadmin split)

```
/                                          → redirects to /__superadmin
/__superadmin                              → SuperAdminLoginPage
/__superadmin/dashboard                    → SuperAdminDashboardPage (lists tenants)
/__superadmin/onboard                      → TenantOnboardingPage (the config form)
/__superadmin/companies/:slug/employees    → CompanyEmployeesPage (superadmin, any company)
/__superadmin/companies/:slug/customers    → CompanyCustomersPage (superadmin, any company)

/:companySlug/login        → TenantLoginPage (branded via TenantContext)
/:companySlug/dashboard    → TenantDashboardPage
/:companySlug/employees    → TenantEmployeesPage
/:companySlug/customers    → TenantCustomersPage
```

`TenantContext.jsx` reads `companySlug` from the route params and calls
`GET /api/<slug>/public-info/` to fetch that company's name/logo *before*
login, so the login page can show the right branding. After login,
`api/auth.js: setSession()` stores the JWT plus a `role` flag
(`tenant_user`/`superadmin`) in `localStorage`; `api/client.js` attaches the
token as a `Bearer` header on every request and clears the stored session on
any `401` response (so an expired/invalid token can't linger and silently
break the *next* login attempt too — see §11's login-fix note).

**`EntityManager.jsx`** is the one component behind all four
Employee/Customer pages — `TenantEmployeesPage`/`TenantCustomersPage` and
`CompanyEmployeesPage`/`CompanyCustomersPage` are thin wrappers that differ
only in where they get `slug` from (tenant context vs. the `:slug` route
param) and which JWT ends up in the request. It fetches `.../schema/` and the
row list, renders an add-form and a table purely from that schema (checkbox
for `boolean`, date picker for `date`, etc.), and posts/deletes against the
same `/api/<slug>/employees|customers/` endpoints either flow uses.

---

## 11. Full local setup, start to finish

```bash
# 1. Central database
mysql -u root -p -e \
  "CREATE DATABASE tenant_platform_central CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. Backend
cd backend
uv venv
uv sync
cp .env.example .env          # edit DB_USER/DB_PASSWORD/etc if not using defaults
uv run python manage.py migrate
uv run python manage.py createsuperuser     # Django admin login
uv run python manage.py runserver

# 3. Seed a superadmin (tenant-platform superadmin, not Django admin)
uv run python manage.py shell
>>> from django.contrib.auth.hashers import make_password
>>> from tenants.models import SuperAdminUser
>>> SuperAdminUser.objects.create(username="admin", password_hash=make_password("choose-a-real-password"))

# 4. Frontend
cd ../frontend
npm install
npm run dev
```

Then, as superadmin (via `/__superadmin` in the browser, or directly against
`POST /api/superadmin/tenants/`), onboard a company — this triggers
`provision_tenant()` end to end: creates `tenant_<slug>` in MySQL, migrates it,
and (once `FieldCatalog`/`TenantFieldConfig` are populated) syncs its field
schema.

```bash
# 5. Give the new company a first end-user (see §8.4 — no signup UI yet)
uv run python manage.py shell
>>> from django.contrib.auth.hashers import make_password
>>> from django.contrib.auth.models import User
>>> User.objects.using("tata").create(username="alice", password=make_password("a-real-password"))
```

That user can now sign in at `/tata/login` in the frontend, and Superadmin can
browse the same company's data at `/__superadmin/companies/tata/employees`
with no separate setup — both routes hit `/api/tata/employees/`, just with a
different JWT (see §8.3).

## 12. Adding a brand-new company field to the catalog later

1. Superadmin creates a new `FieldCatalog` row (e.g. `entity='employee',
   field_key='linkedin_url'`).
2. For each tenant that should have it, create a `TenantFieldConfig` row
   (`enabled=True`).
3. Run `sync_tenant_schema(tenant)` for those tenants (either via a small
   admin action, or `python manage.py shell`) — this adds the column to their
   real MySQL table.
4. Nothing else changes — the dynamic serializer picks up the new field
   automatically on the next request.
