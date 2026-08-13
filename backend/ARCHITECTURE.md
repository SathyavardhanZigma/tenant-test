# Architecture: Multi-Tenant SaaS Platform

## 1. Core idea

One **central database** (`default`) holds the tenant registry and everything superadmin needs. Every onboarded company gets its own **physical MySQL database** (`tenant_<slug>`), created and torn down dynamically at runtime — not declared statically in `settings.DATABASES`, but injected into it while the app is running (`tenants/db_registry.py`).

```
                         ┌─────────────────────────────┐
                         │   default DB (central)       │
                         │  Tenant, TenantModule,        │
                         │  FieldCatalog,                 │
                         │  TenantFieldConfig,            │
                         │  TenantTableLimit,             │
                         │  SuperAdminUser,               │
                         │  TenantAuditLog                │
                         └──────────────┬──────────────┘
                                        │ superadmin reads/writes this only
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        │                               │                               │
 ┌──────▼──────┐               ┌────────▼────────┐              ┌───────▼───────┐
 │ tenant_nike  │               │ tenant_maxwell  │              │ tenant_acme    │
 │ auth_user    │               │ auth_user       │              │ auth_user      │
 │ employees_.. │               │ employees_..    │              │ employees_..   │
 │ customers_.. │               │ customers_..    │              │ customers_..   │
 └─────────────┘               └─────────────────┘              └───────────────┘
```

Each tenant DB has its own isolated `auth_user` table (its own login users) and its own `employees`/`customers` tables — with a **different set of columns per tenant**, driven by data (`FieldCatalog` + `TenantFieldConfig`), not per-tenant migration files.

## 2. Folder structure → responsibility

```
backend/
├── config/              Django project shell: settings, urls, Celery app wiring
├── tenants/              Central registry + the multi-tenancy machinery itself
│   ├── models/           Tenant, TenantModule, FieldCatalog, TenantFieldConfig,
│   │                     TenantTableLimit, SuperAdminUser, TenantAuditLog
│   ├── views/            Superadmin-facing REST API (tenant.py, field_catalog.py)
│   ├── serializers/      DRF serializers for the above
│   ├── provisioning.py   Tenant DB lifecycle: create/drop, phase1/phase2 split
│   ├── tasks.py          Celery task wrapping phase 2 (async provisioning)
│   ├── db_registry.py    Injects tenant DB connections into Django at runtime
│   ├── middleware.py     Resolves the tenant from the URL/header per request
│   ├── context.py        contextvars carrying "which tenant is this request for"
│   ├── routers.py        DATABASE_ROUTERS — sends queries to the right DB
│   ├── entities.py       Fixed entity↔module mapping (employee/customer)
│   ├── dynamic_fields.py data_type → Django field type
│   ├── dynamic_models.py Builds an unmanaged model per tenant's enabled fields
│   ├── schema_sync.py    Real ALTER TABLE ADD/DROP COLUMN per tenant
│   ├── limits.py         Trial vs Complete record-count enforcement
│   └── audit.py          Superadmin action logging
├── core_auth/            JWT auth for both superadmin and tenant users
└── modules/
    ├── employees/        Thin ViewSet + minimal static model (code/timestamps only)
    └── customers/        Same pattern
```

## 3. The mechanism that makes modules "pluggable" — read this first

Everything else builds on four pieces working together:

1. **`FieldCatalog`** (central DB) — the master list of possible fields per entity (`employee`/`customer`), e.g. `emp_code`, `salary`, `address`.
2. **`TenantFieldConfig`** (central DB) — per-tenant, per-field: is it `enabled`, `is_required`, what `order`. This is what the superadmin's Fields wizard step writes.
3. **`schema_sync.sync_tenant_schema(tenant)`** — reads a tenant's `TenantFieldConfig` rows and runs real `ADD COLUMN`/`DROP COLUMN` against that tenant's *physical* table. This is the only place columns actually get created — nothing else touches DDL.
4. **`dynamic_models.get_dynamic_model(entity, tenant)`** — at request time, builds an **unmanaged** Django model class with exactly the fields this tenant has enabled, pointing at the real (already-synced) table. `EmployeeViewSet`/`CustomerViewSet` use this instead of a static `Employee`/`Customer` model, so they serve/accept the right columns per tenant.

So "Tata has 8 employee columns, Tesla has 14" isn't config read at query time to filter a fixed schema — the columns themselves differ per tenant's actual table, and the ORM model is generated fresh per tenant to match.

## 4. Request-routing mechanism

Every incoming request needs to know: *which tenant's database does this touch, if any?*

- **`TenantResolverMiddleware`** — for any path not starting with `/__superadmin`, `/api/superadmin`, `/api/auth/superadmin`, `/swagger`, `/redoc`, `/admin`: resolves a slug (from the `X-Tenant` header or the URL's first path segment), looks up the `Tenant`, returns 403 if suspended, calls `register_tenant_database(tenant)` (lazily — so this process definitely has that DB alias), and stores it via `tenants.context.set_current_tenant(tenant, tenant.slug)` for the duration of the request.
- **`TenantRouter`** (`DATABASE_ROUTERS`) — reads that same context. Models in `TENANT_APPS` (`employees`, `customers`) always route to the active tenant DB. Models in `TENANT_SHARED_APPS` (`auth`, `contenttypes`) route to the tenant DB if one's active, else `default`. Everything else routes to `default`.
- Superadmin routes are **exempt** from this middleware — they operate purely on the central DB via `Tenant`/`TenantModule`/etc., except where a view explicitly needs a tenant's physical DB (field-config, modules, table-limits, users). Those views call `register_tenant_database(tenant)` themselves in `TenantViewSet.get_object()`, since nothing else guarantees it — this matters because provisioning now happens in a separate Celery worker process, so the web server process can't assume a tenant's connection is already registered.

## 5. End-to-end flow: onboarding a new company (superadmin side)

```
Superadmin wizard (OnboardCompanyPage.jsx)
  │ Step 1: Company details, Step 2: Modules, Step 3: Tier/Plan,
  │ Step 4: Limits, Step 5: Fields (all local state until "Create")
  ▼
POST /api/superadmin/tenants/   →  TenantViewSet.create()
  │ 1. TenantOnboardingSerializer validates
  │ 2. create_tenant_record(...)  — central DB only, fast:
  │      Tenant row (status=suspended, provisioning_status=pending),
  │      logo saved, TenantModule rows for selected modules
  │ 3. provision_tenant_task.delay(tenant.id)  → queued on Redis
  │ 4. HTTP 202, tenant serialized with provisioning_status=pending
  ▼
Celery worker (separate process) picks up the task
  │ run_tenant_provisioning(tenant_id):
  │   - provisioning_status = running
  │   - CREATE DATABASE tenant_<slug>
  │   - register_tenant_database(tenant)   (in the worker's own process)
  │   - `migrate` runs every TENANT_APP against the new DB
  │   - drop tables for modules NOT selected
  │   - sync_tenant_schema(tenant)          (adds nothing yet — no
  │        TenantFieldConfig exists until step 6 below)
  │   - success: provisioning_status=ready, status=active
  │   - failure: provisioning_status=failed, provisioning_error=<msg>
  ▼
Frontend polls GET /tenants/{id}/ every 2s until ready/failed
  │ on ready:
  ▼
POST /table-limits/  and  POST /field-config/
  │ table-limits: writes TenantTableLimit rows (central DB only)
  │ field-config: writes TenantFieldConfig rows, then calls
  │   sync_tenant_schema(tenant) again — THIS is what actually adds
  │   the tenant-specific columns (emp_code, salary, address, ...)
  ▼
navigate to dashboard — tenant is fully live
```

Editing an existing company (`isEditMode`) skips the provisioning-wait entirely — the tenant DB already exists, so `updateModules`/`updateTableLimits`/`updateFieldConfig` run immediately and synchronously.

## 6. End-to-end flow: a tenant user logging in and using the app

```
Browser → /maxwell/login → POST /api/maxwell/auth/login/
  │ TenantResolverMiddleware resolves 'maxwell', registers its DB,
  │ sets tenant context, attaches request.tenant
  ▼
TenantLoginView → authenticate() against auth_user table in tenant_maxwell DB
  │ issues JWT: {role: 'tenant_user', tenant_slug: 'maxwell'}
  ▼
Browser stores JWT, calls GET /api/maxwell/employees/
  │ middleware resolves 'maxwell' again, sets context
  │ TenantJWTAuthentication decodes JWT
  │ IsTenantUserOrSuperAdmin checks: tenant_slug matches, 'employees'
  │   module enabled for this tenant, plan allows the HTTP method
  │   (Basic plan → read-only, Enterprise → full CRUD)
  ▼
EmployeeViewSet.get_queryset()
  │ get_dynamic_model('employee', tenant) — builds/caches a model class
  │ with exactly maxwell's enabled employee fields
  │ .objects.using('maxwell') — TenantRouter sends this to tenant_maxwell DB
  ▼
Response: rows with only maxwell's enabled columns, capped by
  tenants.limits.effective_limit(tenant, 'employees') if tier=trial
```

## 7. Superadmin auth (separate, simpler path)

`SuperAdminLoginView` checks `SuperAdminUser` (central DB only) and issues a JWT with `role='superadmin'` — no tenant, no `User` row backing it (`SuperAdminPrincipal` fakes `request.user`). `IsSuperAdmin` / `IsTenantUserOrSuperAdmin` both let this role bypass all tenant/module/plan checks — superadmin always has full CRUD on every tenant.

## 8. What ties it all together at process startup

`TenantsConfig.ready()` calls `load_all_tenant_databases()`, which registers every **active** tenant's DB connection in `settings.DATABASES` / `connections.databases` for whichever process just started (web server, Celery worker, or a `manage.py` shell) — since that registration is per-process and doesn't persist across restarts. Any tenant not yet `active` (still provisioning) is deliberately skipped here; it gets registered on-demand instead, either by the Celery task or lazily by the middleware / `TenantViewSet.get_object()` once it's actually needed.

## 9. Database & field reference — every table and every field, current state

There are two kinds of databases in this system: the one **central** DB, and one **tenant** DB per company. Field lists below are exactly what's defined in code / currently seeded — nothing hypothetical.

### 9.1 Central DB (`default`) — tables

#### `Tenant` (`tenants_tenant`) — one row per onboarded company
The single source of truth for a company's identity, branding, physical DB location, and business config. Nothing here is tenant-scoped data (no employees/customers) — just the registry entry.

| Field | Type | Purpose |
|---|---|---|
| `company_name` | CharField(255) | Display name shown throughout the superadmin dashboard/wizard |
| `slug` | SlugField(100, unique) | The URL segment (`/slug/login`) and the DB connection alias — this is the key `TenantResolverMiddleware` resolves per request and the key used everywhere as `connections[tenant.slug]` |
| `owner_name` | CharField(255) | Company's primary contact name, captured at onboarding |
| `owner_email` | EmailField | Contact email (captured but not yet wired to any actual email sending) |
| `owner_phone` | CharField(32, blank) | Optional contact phone |
| `logo` | ImageField(blank/null) | Company logo file, shown on that company's own login page |
| `primary_color`, `secondary_color` | CharField(7), hex-validated | Branding colors for the tenant's public login page only — never affects the superadmin console |
| `db_name`, `db_host`, `db_port`, `db_user`, `db_password` | CharField | This tenant's physical MySQL connection details — read by `db_registry._connection_config()` to build the live Django DB alias at runtime |
| `status` | CharField, choices: `active` / `suspended` | Gates whether `TenantResolverMiddleware` lets *any* request into this tenant at all (403 if not active) |
| `provisioning_status` | CharField, choices: `pending` / `running` / `ready` / `failed` | Tracks the Celery-run DB-creation/migrate/schema-sync task; the frontend polls this after onboarding |
| `provisioning_error` | TextField(blank) | Captures the exception message if `run_tenant_provisioning()` fails; shown on the dashboard/retry UI |
| `tier` | CharField, choices: `trial` / `complete` | `trial` hard-caps every table at `TRIAL_RECORD_LIMIT` regardless of `TenantTableLimit`; `complete` uses whatever's configured (or unlimited) |
| `plan` | CharField, choices: `basic` / `enterprise` | `basic` = tenant users get read-only access (`SAFE_METHODS` only); `enterprise` = full CRUD. Superadmin always has full CRUD regardless |
| `created_at`, `updated_at` | DateTimeField | Auto timestamps |

#### `TenantModule` (`tenants_tenantmodule`) — which modules a tenant has on
| Field | Type | Purpose |
|---|---|---|
| `tenant` | FK → Tenant (`related_name='modules'`) | Owning company |
| `module_key` | SlugField(100) | `'employees'` or `'customers'` |
| `enabled` | BooleanField(default=True) | Turning this off drops the module's physical table (`drop_entity_table`) and disables its `TenantFieldConfig` rows |

`unique_together`: one row per (tenant, module_key).

#### `FieldCatalog` (`tenants_fieldcatalog`) — master list of every possible field
Tenant-independent. Superadmin manages this centrally (Field Catalog page); it's the menu every tenant picks columns from.

| Field | Type | Purpose |
|---|---|---|
| `entity` | CharField, choices: `employee` / `customer` | Which table this field could belong to |
| `field_key` | SlugField(100) | The actual column name added to a tenant's table (e.g. `emp_code`) |
| `label` | CharField(255) | Human-readable name shown in the UI (e.g. "Employee Code") |
| `data_type` | CharField, choices: `string`/`integer`/`date`/`boolean`/`enum`/`email`/`text` | Which Django field type `build_model_field()` creates — used both for the real `ALTER TABLE` (`schema_sync`) and the per-request dynamic model (`dynamic_models`) |
| `options` | JSONField(blank/null) | Choice list, only meaningful when `data_type='enum'` |
| `is_required_default` | BooleanField(default=False) | Suggested default when a tenant first enables this field — not enforced automatically; `TenantFieldConfig.is_required` is the actual per-tenant value |
| `created_at` | DateTimeField | Auto timestamp |

`unique_together`: (entity, field_key).

**Currently seeded catalog entries** (exactly what exists in this DB right now):

*Employee fields:* `emp_code` (string), `first_name` (string), `last_name` (string), `email` (email), `phone` (string), `department` (string), `designation` (string), `date_of_joining` (date), `is_manager` (boolean), `salary` (integer), `address` (text).

*Customer fields:* `customer_code` (string), `company_name` (string), `contact_email` (email), `phone` (string), `address` (text), `landmark` (string), `is_active` (boolean).

#### `TenantFieldConfig` (`tenants_tenantfieldconfig`) — per-tenant field selection
This is what makes Tata's employee table have 8 columns and Tesla's have 14 — the actual mechanism behind "dynamic fields."

| Field | Type | Purpose |
|---|---|---|
| `tenant` | FK → Tenant (`related_name='field_configs'`) | Owning company |
| `field` | FK → FieldCatalog | Which catalog field this row configures |
| `enabled` | BooleanField(default=True) | If True, `sync_tenant_schema()` ensures the column exists on this tenant's physical table; if False, sync drops it |
| `is_required` | BooleanField(default=False) | Enforced by the dynamic serializer (`dynamic_models`) as a required API field for this tenant |
| `order` | PositiveIntegerField(default=0) | Display order in the UI form/table |

`unique_together`: (tenant, field). Default ordering: by `order`.

#### `TenantTableLimit` (`tenants_tenanttablelimit`) — per-tenant record caps
Only meaningful for Complete-tier tenants — Trial tenants ignore this entirely and are always capped at `TRIAL_RECORD_LIMIT = 4`.

| Field | Type | Purpose |
|---|---|---|
| `tenant` | FK → Tenant (`related_name='table_limits'`) | Owning company |
| `table_key` | CharField, choices: `employees` / `customers` | Which table this cap applies to |
| `max_records` | PositiveIntegerField(null/blank) | `None`/blank = unlimited. Enforced by `tenants.limits.effective_limit()`, which record-creation checks before allowing a new row |

`unique_together`: (tenant, table_key). No row for a table = no limit (Complete tier only).

#### `SuperAdminUser` (`tenants_superadminuser`) — platform-level login
Deliberately separate from any tenant's own `auth_user` table, so superadmin access never depends on any tenant's database existing or being reachable.

| Field | Type | Purpose |
|---|---|---|
| `username` | CharField(150, unique) | Login identifier |
| `password_hash` | CharField(255) | Hashed via `django.contrib.auth.hashers`, checked by `SuperAdminLoginView` — never plaintext |
| `is_active` | BooleanField(default=True) | Disables login without deleting the account |
| `created_at` | DateTimeField | Auto timestamp |

#### `TenantAuditLog` (`tenants_tenantauditlog`) — accountability trail
Records what a superadmin did to a specific tenant, for "who changed what and when."

| Field | Type | Purpose |
|---|---|---|
| `tenant` | FK → Tenant (`related_name='audit_logs'`) | Which company was affected |
| `actor` | CharField(150) | The superadmin username who performed the action |
| `action` | CharField(255) | Short label, e.g. `"suspend"` or `"field_config_updated"` |
| `detail` | JSONField(blank/null) | Free-form extra context about the action |
| `created_at` | DateTimeField | Auto timestamp |

Written via `tenants.audit.log_superadmin_action(tenant, actor, action, detail)`.

### 9.2 Per-tenant DB (`tenant_<slug>`) — tables

Every tenant gets its own physical database with these tables. Nothing here is shared across tenants — Company A's rows are physically in a different database file from Company B's.

#### `auth_user` — Django's built-in User model
This tenant's own login users, completely isolated from every other tenant's. Migrated here because `'auth'` is in `TENANT_SHARED_APPS` — Django's stock fields are used unmodified: `username`, `password` (hashed), `email`, `first_name`, `last_name`, `is_staff`, `is_active`, `is_superuser`, `last_login`, `date_joined`. Created via `TenantViewSet.users` POST action (`User.objects.using(tenant.slug).create(...)`), checked by `TenantLoginView` at login.

#### `employees_employee` — this tenant's employee records
Base columns are fixed by the `Employee` model; everything else is added on top by `schema_sync` according to this tenant's `TenantFieldConfig` rows.

| Field | Type | Purpose |
|---|---|---|
| `code` | CharField(64, unique, blank/null) | Auto-generated record code like `nike-EMP-001` — assigned server-side from the row's own auto-increment id after creation, never client-supplied |
| `created_at`, `updated_at` | DateTimeField | Auto timestamps |
| *(dynamic)* | varies | One column per enabled `TenantFieldConfig` row for `entity='employee'` — drawn from the catalog list above (e.g. `emp_code`, `salary`, `address`), only for fields **this specific tenant** has turned on |

#### `customers_customer` — this tenant's customer records
Same pattern as employees.

| Field | Type | Purpose |
|---|---|---|
| `code` | CharField(64, unique, blank/null) | Auto-generated record code like `nike-CUST-001` |
| `created_at`, `updated_at` | DateTimeField | Auto timestamps |
| *(dynamic)* | varies | One column per enabled `TenantFieldConfig` row for `entity='customer'` (e.g. `customer_code`, `company_name`, `contact_email`) |

Which dynamic columns actually exist on a given tenant's table is visible by querying that tenant's `TenantFieldConfig` (central DB) for `enabled=True` rows — the physical table is expected to match that exactly, kept in sync only by `sync_tenant_schema()` running successfully.

## 10. Module reference

| File | Role |
|---|---|
| `tenants/models/tenant.py` | `Tenant` (company registry, status, tier, plan, provisioning_status), `TenantModule` (which modules are enabled) |
| `tenants/models/field_catalog.py` | `FieldCatalog` (master field definitions), `TenantFieldConfig` (per-tenant enabled/required fields) |
| `tenants/models/limits.py` | `TenantTableLimit`, `TRIAL_RECORD_LIMIT = 4` |
| `tenants/models/superadmin.py` | `SuperAdminUser` — central-DB-only login for superadmin |
| `tenants/models/audit.py` + `tenants/audit.py` | `TenantAuditLog` model + `log_superadmin_action()` helper |
| `tenants/provisioning.py` | `create_tenant_record()` (sync, central DB) + `run_tenant_provisioning()` (async, physical DB creation/migrate/schema-sync) + `drop_tenant_database()` |
| `tenants/tasks.py` | `provision_tenant_task` — Celery wrapper around `run_tenant_provisioning` |
| `tenants/db_registry.py` | `register_tenant_database()`, `load_all_tenant_databases()` |
| `tenants/middleware.py` | `TenantResolverMiddleware` |
| `tenants/context.py` | `set_current_tenant()`, `get_current_tenant_db()`, `get_current_tenant()`, `clear_current_tenant()` |
| `tenants/routers.py` | `TenantRouter` (`DATABASE_ROUTERS`) |
| `tenants/entities.py` | `ENTITY_TO_MODULE_KEY`, `MODULE_CHOICES`, `ENTITY_CODE_PREFIX` |
| `tenants/dynamic_fields.py` | `build_model_field(data_type)` |
| `tenants/dynamic_models.py` | `get_dynamic_model(entity, tenant)` |
| `tenants/schema_sync.py` | `sync_tenant_schema()`, `drop_entity_table()`, `ensure_entity_table()` |
| `tenants/limits.py` | `effective_limit(tenant, table_key)` |
| `tenants/views/tenant.py` | `TenantViewSet` — create/suspend/reactivate/retry-provisioning/field-config/modules/table-limits/users |
| `tenants/views/field_catalog.py` | Superadmin CRUD over `FieldCatalog` itself |
| `core_auth/views.py` | `SuperAdminLoginView`, `TenantLoginView` |
| `core_auth/permissions.py` | `IsTenantUserOrSuperAdmin`, `IsSuperAdmin` |
| `core_auth/authentication.py` | `TenantJWTAuthentication`, `SuperAdminPrincipal` |
| `modules/employees/`, `modules/customers/` | Minimal static model (`code`, timestamps) + thin `ModelViewSet` using the dynamic model/serializer |
| `config/celery.py` + `config/__init__.py` | Celery app bootstrap, tied into Django startup |
| `config/settings.py` | `DATABASES['default']`, `DATABASE_ROUTERS`, `TENANT_APPS`, `TENANT_SHARED_APPS`, `CELERY_BROKER_URL` |
