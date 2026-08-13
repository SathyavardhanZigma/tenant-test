"""Field-level filtering for the dynamic Employee/Customer serializers, on
top of the module-level gate in core_auth.permissions.IsTenantUserOrSuperAdmin.

A staff user's module grant (if any) may restrict which of the tenant's
enabled fields they can see/edit further — e.g. a company may enable 8
employee fields overall (TenantFieldConfig) but only let a given staff member
view 3 of them. Owners and superadmin see every field the company itself has
enabled, same as before this feature existed."""

from .permissions import get_staff_module_grant


def visible_field_keys(request, module_key, all_field_keys):
    """Returns (viewable, editable) subsets of all_field_keys for the current
    request's user. Owners/superadmin get (all_field_keys, all_field_keys).
    A staff user with no module grant gets (frozenset(), frozenset()) — the
    permission class already blocks them before the serializer is built, but
    this keeps the function safe to call unconditionally."""
    all_field_keys = frozenset(all_field_keys)
    grant = get_staff_module_grant(request, module_key)
    if grant == 'bypass':
        return all_field_keys, all_field_keys
    if grant is None:
        return frozenset(), frozenset()

    field_grants = {fg.field_key: fg for fg in grant.field_grants.all()}
    if not field_grants:
        # A module grant with no explicit field rows means "every field this
        # module exposes", scoped by the grant's own can_edit for writes.
        viewable = all_field_keys if grant.can_view else frozenset()
        editable = all_field_keys if grant.can_edit else frozenset()
        return viewable, editable

    viewable = {key for key in all_field_keys if field_grants.get(key) and field_grants[key].can_view}
    editable = {key for key in all_field_keys if field_grants.get(key) and field_grants[key].can_edit}
    return viewable, editable
