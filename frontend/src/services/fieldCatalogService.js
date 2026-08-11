import apiClient from '../api/client';

export const fieldCatalogService = {
  create: (payload) => apiClient.post('/superadmin/field-catalog/', payload),
  read: (params) => apiClient.get('/superadmin/field-catalog/', { params }),
  readById: (id) => apiClient.get(`/superadmin/field-catalog/${id}/`),
  update: (id, payload) => apiClient.patch(`/superadmin/field-catalog/${id}/`, payload),
  delete: (id) => apiClient.delete(`/superadmin/field-catalog/${id}/`),
};
