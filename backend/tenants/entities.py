"""Fixed employees/customers module mapping. The platform only ever supports
these two FieldCatalog-driven, dynamic-schema entities, so this is a plain
dict rather than a database-driven catalog (previously Feature/Plan modeled
this generically; removed since the product scope is fixed to just these
two). MODULE_CHOICES is the broader, Superadmin-toggleable module list —
it also includes modules with no dynamic schema at all (e.g. 'roles',
backed by the fixed core_auth.Role model), so it's a superset of the keys
in ENTITY_TO_MODULE_KEY."""

ENTITY_TO_MODULE_KEY = {
    'employee': 'employees',
    'customer': 'customers',
}

MODULE_CHOICES = [
    ('employees', 'Employees'),
    ('customers', 'Customers'),
    ('roles', 'Roles'),
]

# Prefix used for each entity's auto-generated, tenant-scoped record code,
# e.g. tenant slug "nike" + entity "employee" -> "nike-EMP-001".
ENTITY_CODE_PREFIX = {
    'employee': 'EMP',
    'customer': 'CUST',
}
