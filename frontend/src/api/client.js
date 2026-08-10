import axios from 'axios';
import { handleAuthExpired } from './auth';

// Pinned to 127.0.0.1 rather than 'localhost': the Django dev server binds
// IPv4 only by default, but browsers can resolve 'localhost' to the IPv6
// loopback (::1) first, which nothing is listening on — the request then
// fails before it ever reaches the backend (no CORS error, just "Network
// Error", since the connection itself never completes).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

const apiClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use((requestConfig) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    requestConfig.headers.Authorization = `Bearer ${token}`;
  }
  return requestConfig;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // A rejected/expired/missing token should never linger and keep breaking
    // subsequent requests — clear it and send the user back to log in,
    // rather than leaving them on a page that just shows "Failed to load ...".
    //
    // DRF returns 401 for an invalid/expired token, but 403 with this exact
    // message when no Authorization header was sent at all (no authenticator
    // could even attempt to identify a user) — both mean "not logged in".
    // A 403 with any OTHER message means a real, scoped permission denial
    // (e.g. a tenant user hitting another company's data) and must NOT force
    // a logout/redirect.
    const status = error.response?.status;
    const detail = error.response?.data?.detail;
    const noCredentials = status === 403 && detail === 'Authentication credentials were not provided.';
    if (status === 401 || noCredentials) {
      handleAuthExpired();
    }
    return Promise.reject(error);
  },
);

export default apiClient;
