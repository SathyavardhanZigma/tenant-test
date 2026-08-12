from celery import shared_task

from .provisioning import run_tenant_provisioning


@shared_task
def provision_tenant_task(tenant_id):
    run_tenant_provisioning(tenant_id)
