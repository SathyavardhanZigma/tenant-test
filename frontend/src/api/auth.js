export function setSession({ access, refresh, role, tenant, username }) {
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
  localStorage.setItem('role', role);
  if (tenant) {
    localStorage.setItem('tenant_slug', tenant);
  } else {
    localStorage.removeItem('tenant_slug');
  }
  // Fresh per-login seed for the identicon avatar — same user gets a
  // different look each time they sign back in, per the "refreshed on each
  // login" requirement, while staying stable for the rest of this session.
  localStorage.setItem('session_seed', `${username || role}-${Date.now()}`);
}

export function clearSession() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('role');
  localStorage.removeItem('tenant_slug');
  localStorage.removeItem('session_seed');
}

export function isSuperAdmin() {
  return localStorage.getItem('role') === 'superadmin';
}

export function getSessionSeed() {
  return localStorage.getItem('session_seed') || 'guest';
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
