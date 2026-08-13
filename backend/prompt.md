# Task: Staff-level Module & Field Permissions for Tenant Companies

## Context (already in the codebase — do not rebuild these)

- `tenants.Tenant` — the company record (central DB), with `status`, `tier`, `plan`.
- `tenants.TenantModule` (`tenants/models/tenant.py`) — per-tenant module on/off, set by superadmin. This is the ceiling: a company can never grant staff access to a module that is disabled here.
- `tenants.FieldCatalog` + `tenants.TenantFieldConfig` (`tenants/models/field_catalog.py`) — master field list per entity, and per-tenant enabled/required/order, also set by superadmin via `TenantViewSet.field_config`. This is the ceiling for fields: a company can never expose a field to staff that superadmin hasn't enabled.
- Tenant end-users today are **plain Django `auth.User` rows** living in each tenant's own physical DB (`core_auth/models.py` currently has no custom model). There is no owner/staff distinction and no per-user permission storage anywhere yet.
- Auth: `TenantJWTAuthentication` + `IsTenantUserOrSuperAdmin` (`core_auth/permissions.py`) already resolve the current tenant and check plan-based CRUD gating. Extend this permission class rather than replacing it.
- `TenantRouter` / `db_registry.py` route ORM calls to the correct per-tenant physical DB at request time — any new per-user permission model must live in the **tenant** DB (so it's created via `TENANT_APPS`), not the central DB, since it stores per-staff data scoped to that company.

## What's missing (this task)

1. **Owner vs staff distinction** for tenant `auth.User` accounts. Add a lightweight profile/role model in the tenant DB (e.g. `core_auth.TenantUserProfile` or similar) with a `role` field (`owner` / `staff`) linked one-to-one to `auth.User`. The first user created during tenant onboarding (`TenantViewSet.create`/`users` action) should become `owner`.
2. **Permission model**: a per-staff-user, per-module, per-field grant, scoped to modules/fields the company itself is entitled to (i.e. must be a subset of that tenant's enabled `TenantModule`/`TenantFieldConfig` — validate this at grant time, not just at read time). Store enough to answer: "can this staff user see/edit module X, and which fields of X can they see/edit?"
3. **Owner-only configuration endpoint(s)**: CRUD to list a company's own enabled modules/fields (read-only, sourced from `TenantModule`/`TenantFieldConfig` for the caller's tenant) and to assign/update a staff user's module+field grants. Must reject attempts to grant anything outside the company's superadmin-enabled set (403/400, not silent clipping).
4. **Enforcement at login/data-access time**: when a staff user (not owner) logs in and hits module data endpoints (`modules/customers`, `modules/employees`, etc.), responses must be filtered to only the modules/fields granted to that user. Decide and implement at which layer this is enforced (permission class for module-level gate, serializer field filtering for field-level gate) and wire it into the existing `IsTenantUserOrSuperAdmin` / DRF serializer flow rather than duplicating auth logic.
5. **Migrations**: new models must migrate cleanly into the tenant-DB schema-sync flow already used for tenant apps (check how `TENANT_APPS` migrations currently run per tenant DB, likely via a management command — reuse that path, don't hand-roll a separate one).

## Guidance for the implementer

- Read `ARCHITECTURE.md` in this repo fully before writing code — it documents the DB-per-tenant routing, schema_sync, and dynamic_models mechanisms this feature must respect.
- Do not introduce a new permissions library (no django-guardian, no `rules`) — this is a small enough matrix (module × field × user) to model directly with plain Django models and a DRF permission/serializer layer, consistent with the rest of the codebase.
- Keep superadmin's existing module/field toggles as the single source of truth for what a company *can* expose; the new work only governs what a company chooses to expose *internally* to its own staff, always within that ceiling.
- Owner accounts should implicitly have full access to everything the company is entitled to — they don't need explicit grant rows; only staff need explicit grants.
- Follow existing code conventions: serializers in `*/serializers/`, views in `*/views/`, permission classes in `core_auth/permissions.py`.
- Add tests covering: owner sees everything enabled for the company; staff sees only granted modules/fields; staff cannot be granted a module/field the company itself doesn't have; a disabled `TenantModule` or `TenantFieldConfig` immediately blocks staff access even if a grant row still exists.

## Deliverables

- New model(s) for staff role + module/field permission grants (tenant DB).
- Migration(s) for the above.
- Owner-facing endpoint(s) to view company entitlements and manage staff grants.
- Enforcement in the existing data-access path so staff logins only see permitted modules/fields.
- Tests as described above.
