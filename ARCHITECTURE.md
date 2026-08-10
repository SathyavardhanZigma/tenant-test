# Backend Architecture

A concise reference diagram + component map. For the full narrative walkthrough
(request lifecycle, migrations, field-sync internals) see
[DOCUMENTATION.md](DOCUMENTATION.md).

## System diagram

```
                                   ┌─────────────────────────┐
                                   │        React (Vite)      │
                                   │  /__superadmin/*          │
                                   │  /:companySlug/*          │
                                   └────────────┬─────────────┘
                                                │  JWT (role: superadmin | tenant_user)
                                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              Django (single process)                       │
│                                                                             │
│   config/urls.py ── grouped routes ───────────────────────────────────┐    │
│     /api/auth/superadmin/login/        (central, no tenant)           │    │
│     /api/superadmin/tenants|field-catalog/  (central, superadmin only)│    │
│     /api/<slug>/auth/login/            ┐                              │    │
│     /api/<slug>/public-info/           ├─ tenant-scoped                │    │
│     /api/<slug>/employees|customers/   ┘                              │    │
│                                                                        │    │
│   ┌─────────────────────────────────────────────────────────────┐    │    │
│   │  TenantResolverMiddleware                                    │    │    │
│   │   1. resolve slug from URL/header                            │    │    │
│   │   2. Tenant.objects.get(slug=...)  [404 / 403 if bad]         │    │    │
│   │   3. set_current_tenant(tenant, slug)  → contextvar           │    │    │
│   │   4. request.tenant = tenant                                 │    │    │
│   │   5. ... view runs ...                                       │    │    │
│   │   6. clear_current_tenant()                                  │    │    │
│   └─────────────────────────────────────────────────────────────┘    │    │
│                                                                        │    │
│   ┌─────────────────────────────────────────────────────────────┐    │    │
│   │  TenantJWTAuthentication + IsTenantUserOrSuperAdmin /          │    │
│   │  IsSuperAdmin permission classes                              │    │
│   │   role=superadmin      → any slug                             │    │
│   │   role=tenant_user     → only its own tenant_slug             │    │
│   └─────────────────────────────────────────────────────────────┘    │    │
│                                                                        │    │
│   ┌─────────────────────────────────────────────────────────────┐    │    │
│   │  get_dynamic_model(entity, tenant)  +  TenantRouter            │    │
│   │   - builds a Model class w/ exactly that tenant's enabled       │    │
│   │     fields (from TenantFieldConfig), pointed at the shared      │    │
│   │     employees_employee / customers_customer table names         │    │
│   │   - router sends TENANT_APPS + TENANT_SHARED_APPS queries        │    │
│   │     to the active tenant DB alias (contextvar), else 'default'  │    │
│   └─────────────────────────────────────────────────────────────┘    │    │
└───────────────────────────────────────────────────────────────────────────┘
                 │                              │                    │
                 ▼                              ▼                    ▼
     ┌───────────────────┐        ┌───────────────────┐   ┌───────────────────┐
     │ Central DB          │        │ tenant_tata DB      │   │ tenant_tesla DB     │
     │ (default alias)      │        │                     │   │                     │
     │ Tenant                │        │ auth_user            │   │ auth_user            │
     │ TenantModule          │        │ employees_employee    │   │ employees_employee    │
     │ FieldCatalog          │        │  (8 columns for Tata) │   │  (14 columns for Tesla)│
     │ TenantFieldConfig     │        │ customers_customer     │   │ customers_customer     │
     │ SuperAdminUser        │        │                        │   │                        │
     │ TenantAuditLog        │        │                        │   │                        │
     │ auth_user (Django admin)│      │                        │   │                        │
     └───────────────────┘        └───────────────────┘   └───────────────────┘
```

## Component map

| Layer | File(s) | Responsibility |
|---|---|---|
| Tenant resolution | `tenants/middleware.py` | Slug → `Tenant` row → bind DB context for the request |
| DB context | `tenants/context.py` | `contextvar` the router reads (middleware can't hand a request to a router) |
| DB routing | `tenants/routers.py` | `TenantRouter` — which alias each query/migration hits |
| Connection injection | `tenants/db_registry.py` | Adds a tenant's DB into `settings.DATABASES` at runtime |
| Provisioning | `tenants/provisioning.py` | Create DB → migrate → sync schema, on onboarding |
| Migrations | `tenants/management/commands/migrate.py`, `migrate_all_tenants.py` | `migrate --tenant=<slug>`, extends stock Django |
| Physical schema | `tenants/schema_sync.py` | Raw `ADD COLUMN` per tenant's enabled `TenantFieldConfig` |
| ORM-facing schema | `tenants/dynamic_models.py` | Per-tenant Model class so the ORM can actually use those columns |
| Auth | `core_auth/views.py`, `authentication.py` | Superadmin login (central) vs. tenant login (tenant DB); custom JWT auth for superadmin's user-less token |
| Authorization | `core_auth/permissions.py`, `tenants/views.py:IsSuperAdmin` | Role + tenant-slug matching, not Django `is_staff` |
| Audit | `tenants/audit.py`, `tenants/mixins.py` | Logs superadmin writes against tenant data |
| Central models | `tenants/models.py` | `Tenant`, `TenantModule`, `FieldCatalog`, `TenantFieldConfig`, `SuperAdminUser`, `TenantAuditLog` |
| Tenant-scoped models | `employees/models.py`, `customers/models.py` | Core columns only (`id`, `created_at`, `updated_at`) — everything else is dynamic |

## Two databases, one process

There is no per-tenant Django process/deployment — one Django process serves
every company. What changes per request is **which MySQL connection alias**
the ORM uses, decided by `TenantRouter` reading a per-request `contextvar` that
`TenantResolverMiddleware` sets from the URL slug. This is why Superadmin can
hit `/api/tata/employees/` and `/api/tesla/employees/` back-to-back with the
same running server and get correctly isolated results each time.

## Request → response, one line each

1. `TenantResolverMiddleware` — slug → `Tenant` → `request.tenant` + DB context set
2. `TenantJWTAuthentication` — validates the JWT, resolves `request.user`/`request.auth`
3. `IsTenantUserOrSuperAdmin` — checks role/slug match
4. `EmployeeViewSet.get_queryset()` / `get_serializer_class()` — built from `get_dynamic_model()`
5. ORM query — `TenantRouter` sends it to the tenant DB alias from the contextvar
6. `TenantEntityViewSetMixin._maybe_audit()` — logs the write if the actor was a superadmin
7. Middleware `finally:` — `clear_current_tenant()`
