import { Navigate } from 'react-router-dom';
import { getAccessToken, getTenantSlug, isTenantOwner } from '../api/auth';

/** Guards superadmin-only routes: redirects to /__superadmin immediately if
 * there's no valid-looking session, instead of rendering the page and letting
 * its first API call fail with a raw "Failed to load ..." error. */
export function RequireSuperAdmin({ children }) {
  if (!getAccessToken('superadmin')) {
    return <Navigate to="/__superadmin" replace />;
  }
  return children;
}

/** Guards tenant-user routes for one specific company: redirects to that
 * company's own login if there's no session, or if the session belongs to a
 * different company (e.g. following a stale link after switching tenants). */
export function RequireTenantUser({ slug, children }) {
  if (!getAccessToken('tenant_user') || getTenantSlug() !== slug) {
    return <Navigate to={`/${slug}/login`} replace />;
  }
  return children;
}

/** Guards owner-only tenant routes (e.g. Staff Permissions): same session
 * checks as RequireTenantUser, plus bounces staff logins back to the
 * dashboard — the backend enforces this too (IsTenantOwner), this just
 * avoids flashing a page that immediately errors for a staff user. */
export function RequireTenantOwner({ slug, children }) {
  if (!getAccessToken('tenant_user') || getTenantSlug() !== slug) {
    return <Navigate to={`/${slug}/login`} replace />;
  }
  if (!isTenantOwner()) {
    return <Navigate to={`/${slug}/dashboard`} replace />;
  }
  return children;
}

