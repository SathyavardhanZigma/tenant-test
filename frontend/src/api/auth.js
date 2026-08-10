export function setSession({ access, refresh, role, tenant }) {
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
  localStorage.setItem('role', role);
  if (tenant) {
    localStorage.setItem('tenant_slug', tenant);
  } else {
    localStorage.removeItem('tenant_slug');
  }
}

export function clearSession() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('role');
  localStorage.removeItem('tenant_slug');
}

export function isSuperAdmin() {
  return localStorage.getItem('role') === 'superadmin';
}

/** Called when the API rejects the current token (expired/invalid). Clears
 * the stale session and sends the user back to whichever login page fits
 * their last role, instead of leaving them stuck on a broken screen with a
 * generic "Failed to load ..." error. */
export function handleAuthExpired() {
  const role = localStorage.getItem('role');
  const tenantSlug = localStorage.getItem('tenant_slug');
  clearSession();

  if (role === 'superadmin') {
    window.location.href = '/__superadmin';
  } else if (tenantSlug) {
    window.location.href = `/${tenantSlug}/login`;
  }
}
