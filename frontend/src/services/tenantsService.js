import apiClient from '../api/client';

/** All Superadmin-facing tenant-registry API calls in one place — pages
 * should never call apiClient directly for these endpoints. */
export const tenantsService = {
  create: (formData) =>
    apiClient.post('/superadmin/tenants/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  read: (params) => apiClient.get('/superadmin/tenants/', { params }),
  readById: (tenantId) => apiClient.get(`/superadmin/tenants/${tenantId}/`),
  update: (tenantId, payload) => apiClient.patch(`/superadmin/tenants/${tenantId}/`, payload),
  delete: (tenantId) => apiClient.delete(`/superadmin/tenants/${tenantId}/`),

  suspend: (tenantId) => apiClient.post(`/superadmin/tenants/${tenantId}/suspend/`),
  reactivate: (tenantId) => apiClient.post(`/superadmin/tenants/${tenantId}/reactivate/`),

  readModules: (tenantId) => apiClient.get(`/superadmin/tenants/${tenantId}/modules/`),
  updateModules: (tenantId, moduleKeys) =>
    apiClient.post(`/superadmin/tenants/${tenantId}/modules/`, { module_keys: moduleKeys }),

  readFieldConfig: (tenantId) => apiClient.get(`/superadmin/tenants/${tenantId}/field-config/`),
  updateFieldConfig: (tenantId, rows) =>
    apiClient.post(`/superadmin/tenants/${tenantId}/field-config/`, rows),

  readTableLimits: (tenantId) => apiClient.get(`/superadmin/tenants/${tenantId}/table-limits/`),
  updateTableLimits: (tenantId, payload) =>
    apiClient.post(`/superadmin/tenants/${tenantId}/table-limits/`, payload),

  readUsers: (tenantId) => apiClient.get(`/superadmin/tenants/${tenantId}/users/`),
  createUser: (tenantId, payload) => apiClient.post(`/superadmin/tenants/${tenantId}/users/`, payload),

  /** Convenience: most "company config" pages need the tenant's own id
   * looked up by slug before they can call the rest of this service. */
  findBySlug: async (slug) => {
    const response = await tenantsService.read();
    const list = response.data.results ?? response.data;
    return list.find((t) => t.slug === slug) ?? null;
  },
};
