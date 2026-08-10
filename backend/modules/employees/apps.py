from django.apps import AppConfig


class EmployeesConfig(AppConfig):
    # Dotted path reflects the new location; Django derives app_label from the
    # last component ('employees'), so migration history and TENANT_APPS
    # (which reference the label, not this path) are unaffected by the move.
    name = 'modules.employees'
