import apiClient from '../api/client';

/** Factory for tenant-scoped Employee/Customer CRUD — every entity module
 * (employees, customers, and any future one) gets the same shape without
 * duplicating endpoint strings across components.
 *
 * `asSuperAdmin` is set by EmployeesSuperAdminView/CustomersSuperAdminView,
 * which hit these same URLs while browsing a company's data as superadmin
 * rather than as that company's own logged-in user — the request needs the
 * superadmin's token, not a (likely absent) tenant-user token for that slug. */
export function createEntityService(slug, entity, { asSuperAdmin = false } = {}) {
  const base = `/${slug}/${entity}`;
  const config = { authDomain: asSuperAdmin ? 'superadmin' : 'tenant_user' };

  return {
    getSchema: () => apiClient.get(`${base}/schema/`, config),
    create: (data) => apiClient.post(`${base}/`, data, config),
    read: (params) => apiClient.get(`${base}/`, { ...config, params }),
    readById: (id) => apiClient.get(`${base}/${id}/`, config),
    update: (id, data) => apiClient.patch(`${base}/${id}/`, data, config),
    delete: (id) => apiClient.delete(`${base}/${id}/`, config),
  };
}
