import { Navigate } from 'react-router-dom';

/** Guards superadmin-only routes: redirects to /__superadmin immediately if
 * there's no valid-looking session, instead of rendering the page and letting
 * its first API call fail with a raw "Failed to load ..." error. */
export function RequireSuperAdmin({ children }) {
  const token = localStorage.getItem('access_token');
  const role = localStorage.getItem('role');

  if (!token || role !== 'superadmin') {
    return <Navigate to="/__superadmin" replace />;
  }
  return children;
}

/** Guards tenant-user routes for one specific company: redirects to that
 * company's own login if there's no session, or if the session belongs to a
 * different company (e.g. following a stale link after switching tenants). */
export function RequireTenantUser({ slug, children }) {
  const token = localStorage.getItem('access_token');
  const role = localStorage.getItem('role');
  const tenantSlug = localStorage.getItem('tenant_slug');

  if (!token || role !== 'tenant_user' || tenantSlug !== slug) {
    return <Navigate to={`/${slug}/login`} replace />;
  }
  return children;
}
