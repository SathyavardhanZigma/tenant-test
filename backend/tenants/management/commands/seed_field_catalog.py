from django.core.management.base import BaseCommand

from tenants.models import FieldCatalog

# Master field list per entity. This is the menu every tenant's Fields wizard
# step picks columns from (see FieldCatalog docstring / ARCHITECTURE.md 9.1).
EMPLOYEE_FIELDS = [
    {'field_key': 'emp_code', 'label': 'Employee Code', 'data_type': 'string'},
    {'field_key': 'first_name', 'label': 'First Name', 'data_type': 'string'},
    {'field_key': 'last_name', 'label': 'Last Name', 'data_type': 'string'},
    {'field_key': 'email', 'label': 'Email', 'data_type': 'email'},
    {'field_key': 'phone', 'label': 'Phone', 'data_type': 'string'},
    {'field_key': 'department', 'label': 'Department', 'data_type': 'string'},
    {'field_key': 'designation', 'label': 'Designation', 'data_type': 'string'},
    {'field_key': 'date_of_joining', 'label': 'Date of Joining', 'data_type': 'date'},
    {'field_key': 'is_manager', 'label': 'Is Manager', 'data_type': 'boolean'},
    {'field_key': 'salary', 'label': 'Salary', 'data_type': 'integer'},
    {'field_key': 'address', 'label': 'Address', 'data_type': 'text'},
]

CUSTOMER_FIELDS = [
    {'field_key': 'customer_code', 'label': 'Customer Code', 'data_type': 'string'},
    {'field_key': 'company_name', 'label': 'Company Name', 'data_type': 'string'},
    {'field_key': 'contact_email', 'label': 'Contact Email', 'data_type': 'email'},
    {'field_key': 'phone', 'label': 'Phone', 'data_type': 'string'},
    {'field_key': 'address', 'label': 'Address', 'data_type': 'text'},
    {'field_key': 'landmark', 'label': 'Landmark', 'data_type': 'string'},
    {'field_key': 'is_active', 'label': 'Is Active', 'data_type': 'boolean'},
]


class Command(BaseCommand):
    help = (
        'Seed the central FieldCatalog with the master employee/customer field list. '
        'Safe to re-run — existing (entity, field_key) rows are left untouched.'
    )

    def handle(self, *args, **options):
        created = 0
        for entity, fields in (
            (FieldCatalog.ENTITY_EMPLOYEE, EMPLOYEE_FIELDS),
            (FieldCatalog.ENTITY_CUSTOMER, CUSTOMER_FIELDS),
        ):
            for row in fields:
                _, was_created = FieldCatalog.objects.get_or_create(
                    entity=entity,
                    field_key=row['field_key'],
                    defaults={'label': row['label'], 'data_type': row['data_type']},
                )
                created += int(was_created)

        self.stdout.write(self.style.SUCCESS(
            f'FieldCatalog seeded: {created} field(s) created, '
            f'{len(EMPLOYEE_FIELDS) + len(CUSTOMER_FIELDS) - created} already present.'
        ))
