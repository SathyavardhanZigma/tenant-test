"""Fixed employees/customers module mapping. The platform only ever supports
these two tenant-scoped entities, so this is a plain dict rather than a
database-driven catalog (previously Feature/Plan modeled this generically;
removed since the product scope is fixed to just these two)."""

ENTITY_TO_MODULE_KEY = {
    'employee': 'employees',
    'customer': 'customers',
}

MODULE_CHOICES = [
    ('employees', 'Employees'),
    ('customers', 'Customers'),
]

# Prefix used for each entity's auto-generated, tenant-scoped record code,
# e.g. tenant slug "nike" + entity "employee" -> "nike-EMP-001".
ENTITY_CODE_PREFIX = {
    'employee': 'EMP',
    'customer': 'CUST',
}
