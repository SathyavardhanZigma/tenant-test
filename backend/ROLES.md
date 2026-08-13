# How Role data maps onto Employee records

## 1. There is no foreign key

`Employee.role` is a plain `VARCHAR(100)` text column. `core_auth.Role` is a
completely separate table, living in that same tenant's own database.
**Nothing at the database level links the two.** No `ForeignKey`, no
`role_id` column, no referential integrity, no `ON DELETE` behavior — you
could `DROP TABLE core_auth_role` entirely and every existing Employee row
would keep whatever string is already sitting in its `role` column,
untouched.

```
tenant_<slug> DB
┌─────────────────────────┐          ┌───────────────────────┐
│ employees_employee       │          │ core_auth_role         │
│  id                       │          │  id                    │
│  code                     │          │  name          (unique)│
│  ...other dynamic columns │          │  created_at            │
│  role   VARCHAR(100)      │          │                        │
│    e.g. "Manager"         │          │  e.g. "Manager",       │
│    (just a text value —   │          │       "Team Lead", ... │
│     not a reference)      │          │                        │
└─────────────────────────┘          └───────────────────────┘
        ▲                                        ▲
        └──────────── no SQL relationship ───────┘
        The only place these two are ever brought together is a
        Python-level lookup in one API endpoint — see §3.
```

## 2. Why: `role` is a dynamic, per-tenant column, not a real relation

Employee's real columns aren't fixed in code — they're generated per tenant
from `FieldCatalog` + `TenantFieldConfig` (see `ARCHITECTURE.md`). `role` is
just one more `FieldCatalog` row, exactly like `salary` or `department`,
except its `data_type` is `'role'` instead of `'string'`/`'integer'`/etc.

| File | What it does for `data_type='role'` |
|---|---|
| `tenants/models/field_catalog.py` | Declares `'role'` as a valid `FieldCatalog.data_type` choice. |
| `tenants/dynamic_fields.py` | `build_model_field('role')` → `CharField(max_length=100)` — **identical** to how `'enum'` is handled. This is what `schema_sync.py` uses to `ALTER TABLE` the real column onto the tenant's Employee table, and what `dynamic_models.py` uses to declare the field on the per-request Employee model class. |
| `tenants/schema_sync.py` | Physically adds/drops the `role` column when the field is enabled/disabled for a tenant — same mechanism as any other dynamic field. |

So as far as the database and the Django ORM are concerned, `role` is
exactly as "special" as a free-text field — it has no awareness that a
`Role` table even exists. All the actual role-awareness lives one layer up,
purely in the API.

## 3. Where the two are actually joined: the `schema` endpoint

The join happens in exactly one place, at request time, in Python —
`tenants/mixins.py` → `TenantEntityViewSetMixin.schema`, which backs
`GET /api/<slug>/employees/schema/`. This is the endpoint the frontend
calls to find out what fields to render on the Add/Edit form and what
columns to show in the table (see `EntityManager.jsx`).

```python
role_names = None
if any(cfg.field.data_type == 'role' for cfg in configs):
    role_names = list(Role.objects.values_list('name', flat=True))

return Response([...] + [
    {
        'key': cfg.field.field_key,
        ...
        'options': role_names if cfg.field.data_type == 'role' else cfg.field.options,
        ...
    }
    for cfg in configs
])
```

Step by step:

1. The endpoint loops through every field enabled for this tenant.
2. If **any** of them has `data_type == 'role'`, it runs a **separate, live
   SQL query** — `Role.objects.values_list('name', flat=True)` — completely
   independent of the Employee table.
3. For the specific field whose `data_type` is `'role'`, it overwrites that
   field's `options` with this freshly-queried list of names. Every other
   field type (e.g. a plain `'enum'` field) keeps its `options` from the
   static `FieldCatalog.options` column instead.
4. The response goes back with `options: ["Manager", "Team Lead", ...]`
   sitting inside the `role` field's schema entry.

The frontend (`EntityManager.jsx`'s `FieldControl`) doesn't know or care
where `options` came from — it renders a `<select>` from whatever list is in
a field's `options` array, treating `'enum'` and `'role'` identically. This
Python-level, re-computed-every-time join is what makes "add a role, see it
in the dropdown immediately" work with no deploy and no schema migration:
the relationship is assembled fresh on every `schema/` call, not stored
anywhere.

## 4. What happens when the user actually submits a role

When someone picks "Manager" from the dropdown and saves the form, the
request body is just `{"role": "Manager", ...}` — indistinguishable from
submitting any other text field. Django writes that string straight into
the `role` column. There is no lookup, no validation against the `Role`
table, and no id being stored — the Employee row ends up holding a **copy**
of the role's name, not a pointer to it.

One practical consequence: if a role is later renamed or deleted from the
`Role` table, every Employee row that already has that name in its `role`
column keeps the old text forever — nothing cascades, because nothing was
ever linked.

## 5. Roles is now a Superadmin-toggleable module — a second gate

Since this mapping was first built, Roles became a full third module
alongside Employees/Customers (see `tenants.entities.MODULE_CHOICES`),
independently enable/disable-able per company by Superadmin — same as
Employees or Customers.

| File | Role |
|---|---|
| `tenants/entities.py` | `MODULE_CHOICES` includes `('roles', 'Roles')`. `Role` still has **no** entry in `ENTITY_TO_MODULE_KEY`, because it has no dynamic FieldCatalog schema — it's a fixed `id`/`name` table, not a per-tenant column set. |
| `core_auth/views_roles.py` | `RoleViewSet.module_key = 'roles'`. |
| `core_auth/permissions.py` | `IsTenantUserOrSuperAdmin` / `IsTenantOwner` check `getattr(view, 'module_key', None)` — this is how a view without a FieldCatalog `entity` (like `RoleViewSet`) still gets module-gated. |

This means access to `Role` is gated **twice**, independently:

- **Is the "roles" module enabled for this company?** (`TenantModule`,
  Superadmin-controlled) — if not, `/api/<slug>/roles/` 403s entirely, for
  everyone including the owner, and `'roles'` disappears from the tenant's
  public `features` list (hiding the nav link/dashboard card).
- **Is the "employees" module enabled, and is the `role` field itself
  enabled for Employee?** (`TenantFieldConfig`, also Superadmin-controlled)
  — independent of the above. A company could have Roles enabled (so the
  owner can maintain a role list) while the Employee `role` field itself is
  disabled (so it never appears on the Employee form at all) — or vice
  versa. Disabling the "roles" module does **not** clear or hide the
  Employee `role` field; that's controlled separately via
  `TenantFieldConfig`.

Who can read vs. write the role **list** (not individual Employee records)
is a third, independent axis:

| Action | Who |
|---|---|
| `GET /api/<slug>/roles/` (populate the dropdown) | Any tenant user, or Superadmin — gated only by the "roles" module being enabled. |
| `POST` / `DELETE /api/<slug>/roles/` (add/remove a role) | The company's owner, or Superadmin — gated by module *and* by owner-only write access (`IsTenantOwner`). |

## 6. The one thing this does *not* do: enforce integrity

Because the join is UI-only (§3) and the write path never checks against
`Role` (§4), **nothing stops a raw API call from writing an Employee `role`
value that was never added via the Roles page** — e.g.
`POST /api/<slug>/employees/ {"role": "Wizard"}` succeeds even though
"Wizard" doesn't exist in that tenant's `Role` table. The dropdown narrows
what a normal form submission sends; it is not a database constraint or
serializer-level validation.

If real enforcement is wanted later, the fix is scoped to one place:
validate the submitted `role` value against
`Role.objects.values_list('name', flat=True)` inside the dynamic Employee
serializer (`modules/employees/serializers.py`) before save — not a schema
change, since the column is already just a string.

## 7. File map

| File | Responsibility |
|---|---|
| `core_auth/models.py` | `Role` model (`id`, `name`, `created_at`). |
| `core_auth/serializers.py` | `RoleSerializer`. |
| `core_auth/views_roles.py` | `RoleViewSet` — list/create/delete, module-gated (`module_key = 'roles'`). |
| `core_auth/urls_roles.py` + `config/urls.py` | Mounts the viewset at `/api/<slug>/roles/`. |
| `core_auth/permissions.py` | `IsTenantUserOrSuperAdmin` / `IsTenantOwner` — enforce the "roles" module toggle and owner-only writes. |
| `tenants/entities.py` | `MODULE_CHOICES` — where `'roles'` is registered as a toggleable module. |
| `tenants/models/field_catalog.py` | `FieldCatalog.data_type` choices, including `'role'`. |
| `tenants/dynamic_fields.py` | Maps `data_type='role'` to a `CharField` column — same as `'enum'`. |
| `tenants/mixins.py` | `TenantEntityViewSetMixin.schema` — the one place the `Role` table and the Employee `role` field are actually joined (§3). |
| Frontend: `services/roleService.js`, `pages/shared/RolesManager.jsx` | Owner/Superadmin-facing UI for adding and removing roles. |
| Frontend: `pages/modules/shared/EntityManager.jsx` | Renders the `role` field as a `<select>`, sourced from whatever `options` the `schema` endpoint returned. |
