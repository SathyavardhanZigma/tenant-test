import apiClient from '../api/client';

export const publicService = {
  /** Unauthenticated tenant branding lookup (company name/logo) — used to
   * render a tenant-branded login page before the user signs in. */
  getTenantInfo: (slug) => apiClient.get(`/${slug}/public-info/`),
};
