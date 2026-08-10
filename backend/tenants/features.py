DEFAULT_FEATURES = [
    {
        'key': 'employees',
        'label': 'Employees',
        'description': 'Employee records and employee-specific fields.',
        'entity': 'employee',
        'sort_order': 10,
    },
    {
        'key': 'customers',
        'label': 'Customers',
        'description': 'Customer records and customer-specific fields.',
        'entity': 'customer',
        'sort_order': 20,
    },
    {
        'key': 'inventory',
        'label': 'Inventory',
        'description': 'Inventory subscription option.',
        'entity': None,
        'sort_order': 30,
    },
    {
        'key': 'billing',
        'label': 'Billing',
        'description': 'Billing subscription option.',
        'entity': None,
        'sort_order': 40,
    },
]


def active_features():
    from .models import Feature

    return Feature.objects.filter(is_active=True).order_by('sort_order', 'label')


def active_feature_keys():
    return set(active_features().values_list('key', flat=True))


def entity_to_feature_key():
    return {
        entity: key
        for entity, key in active_features()
        .exclude(entity__isnull=True)
        .exclude(entity='')
        .values_list('entity', 'key')
    }
