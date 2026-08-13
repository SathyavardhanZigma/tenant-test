import apiClient from '../api/client';

/** Factory for owner-facing staff module/field permission management —
 * mirrors createEntityService's asSuperAdmin shape. Reachable by that
 * company's own owner login, or by Superadmin managing any company (backend
 * enforces via IsTenantOwner, which passes a superadmin JWT through). */
export function createStaffService(slug, { asSuperAdmin = false } = {}) {
  const base = `/${slug}/auth`;
  const config = { authDomain: asSuperAdmin ? 'superadmin' : 'tenant_user' };

  return {
    readEntitlements: () => apiClient.get(`${base}/entitlements/`, config),
    readStaffList: () => apiClient.get(`${base}/staff/`, config),
    readPermissions: (username) => apiClient.get(`${base}/staff/${username}/permissions/`, config),
    updatePermissions: (username, rows) => apiClient.post(`${base}/staff/${username}/permissions/`, rows, config),
  };
}
