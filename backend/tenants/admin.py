from django.contrib import admin

from .models import FieldCatalog, SuperAdminUser, Tenant, TenantAuditLog, TenantFieldConfig, TenantModule

admin.site.register(Tenant)
admin.site.register(TenantModule)
admin.site.register(FieldCatalog)
admin.site.register(TenantFieldConfig)
admin.site.register(SuperAdminUser)
admin.site.register(TenantAuditLog)
