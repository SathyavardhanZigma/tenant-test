import apiClient from '../api/client';

/** Factory for a company's own Role list (Employee "Role" field choices) —
 * mirrors createEntityService/createStaffService's asSuperAdmin shape. */
export function createRoleService(slug, { asSuperAdmin = false } = {}) {
  const base = `/${slug}/roles`;
  const config = { authDomain: asSuperAdmin ? 'superadmin' : 'tenant_user' };

  return {
    read: () => apiClient.get(`${base}/`, config),
    create: (name) => apiClient.post(`${base}/`, { name }, config),
    delete: (id) => apiClient.delete(`${base}/${id}/`, config),
  };
}
