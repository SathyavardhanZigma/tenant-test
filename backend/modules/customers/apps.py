from django.apps import AppConfig


class CustomersConfig(AppConfig):
    # See modules/employees/apps.py for why this dotted path is safe to change.
    name = 'modules.customers'
