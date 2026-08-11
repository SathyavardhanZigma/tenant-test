import apiClient from '../api/client';

export const authService = {
  superAdminLogin: (username, password) =>
    apiClient.post('/auth/superadmin/login/', { username, password }),

  tenantLogin: (slug, username, password) =>
    apiClient.post(`/${slug}/auth/login/`, { username, password }),
};
