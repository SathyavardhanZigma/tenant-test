import apiClient from '../api/client';

/** Tenant-facing dashboard + capability reads. Both are slug-scoped, so the
 * backend resolves the tenant from the URL exactly as it does for entity CRUD.
 *
 * The dashboard response is already shaped by that tenant's capabilities —
 * a section the tenant isn't entitled to is absent from the payload, not
 * present-but-flagged. So the UI renders whatever it receives rather than
 * re-deciding visibility client-side. */
export const dashboardService = {
  read: (slug) => apiClient.get(`/${slug}/dashboard/`),
  readCapabilities: (slug) => apiClient.get(`/${slug}/capabilities/`),
};
