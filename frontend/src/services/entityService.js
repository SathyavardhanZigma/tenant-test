import apiClient from '../api/client';

/** Factory for tenant-scoped Employee/Customer CRUD — every entity module
 * (employees, customers, and any future one) gets the same shape without
 * duplicating endpoint strings across components. */
export function createEntityService(slug, entity) {
  const base = `/${slug}/${entity}`;

  return {
    getSchema: () => apiClient.get(`${base}/schema/`),
    create: (data) => apiClient.post(`${base}/`, data),
    read: (params) => apiClient.get(`${base}/`, { params }),
    readById: (id) => apiClient.get(`${base}/${id}/`),
    update: (id, data) => apiClient.patch(`${base}/${id}/`, data),
    delete: (id) => apiClient.delete(`${base}/${id}/`),
  };
}
