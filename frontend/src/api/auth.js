// Superadmin and tenant-user sessions are namespaced under separate
// localStorage keys so a superadmin can browse the panel in one tab while
// staying (or logging in as) a company user in another, without either
// session silently overwriting the other's token. Before this, both wrote to
// the same 'access_token'/'role' keys, so logging into any company kicked
// out the superadmin (and vice versa) — surfacing as a mysterious "auto
// logout" of whichever session wasn't touched last.
const DOMAIN_KEYS = {
  superadmin: {
    access: 'superadmin_access_token',
    refresh: 'superadmin_refresh_token',
    seed: 'superadmin_session_seed',
  },
  tenant_user: {
    access: 'tenant_access_token',
    refresh: 'tenant_refresh_token',
    seed: 'tenant_session_seed',
    slug: 'tenant_slug',
    staffRole: 'tenant_staff_role',
  },
};

export function setSession({ access, refresh, role, tenant, username, staff_role: staffRole }) {
  const keys = DOMAIN_KEYS[role];
  localStorage.setItem(keys.access, access);
  localStorage.setItem(keys.refresh, refresh);
  if (keys.slug) {
    localStorage.setItem(keys.slug, tenant);
  }
  if (keys.staffRole) {
    // owner/staff — see core_auth.models.StaffProfile. Drives whether the
    // "Staff Permissions" page/link shows up for this tenant user.
    localStorage.setItem(keys.staffRole, staffRole || 'owner');
  }
  // Fresh per-login seed for the identicon avatar — same user gets a
  // different look each time they sign back in, per the "refreshed on each
  // login" requirement, while staying stable for the rest of this session.
  localStorage.setItem(keys.seed, `${username || role}-${Date.now()}`);
}

function clearDomain(role) {
  const keys = DOMAIN_KEYS[role];
  localStorage.removeItem(keys.access);
  localStorage.removeItem(keys.refresh);
  localStorage.removeItem(keys.seed);
  if (keys.slug) {
    localStorage.removeItem(keys.slug);
  }
  if (keys.staffRole) {
    localStorage.removeItem(keys.staffRole);
  }
}

export const clearSuperAdminSession = () => clearDomain('superadmin');
export const clearTenantSession = () => clearDomain('tenant_user');

export function isSuperAdmin() {
  return Boolean(localStorage.getItem(DOMAIN_KEYS.superadmin.access));
}

export function getSessionSeed(role) {
  return localStorage.getItem(DOMAIN_KEYS[role].seed) || 'guest';
}

export function getAccessToken(role) {
  return localStorage.getItem(DOMAIN_KEYS[role].access);
}

export function getTenantSlug() {
  return localStorage.getItem(DOMAIN_KEYS.tenant_user.slug);
}

/** 'owner' or 'staff' for the current tenant-user session — see
 * core_auth.models.StaffProfile. Sessions created before this feature
 * shipped never stored one; treat that as 'owner' so nobody who could
 * already do everything suddenly loses the "Staff Permissions" page. */
export function getStaffRole() {
  return localStorage.getItem(DOMAIN_KEYS.tenant_user.staffRole) || 'owner';
}

export function isTenantOwner() {
  return getStaffRole() === 'owner';
}

/** Called when the API rejects the current token for the given domain
 * (expired/invalid). Clears just that session and sends the user back to
 * its login page, instead of leaving them stuck on a broken screen with a
 * generic "Failed to load ..." error — and without touching the other
 * domain's still-valid session. */
export function handleAuthExpired(role) {
  const tenantSlug = role === 'tenant_user' ? getTenantSlug() : null;
  clearDomain(role);

  if (role === 'superadmin') {
    window.location.href = '/__superadmin';
  } else if (tenantSlug) {
    window.location.href = `/${tenantSlug}/login`;
  }
}
