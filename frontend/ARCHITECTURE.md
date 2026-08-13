# Architecture: Frontend (React + Vite)

## 1. Core idea

One React SPA serves **two audiences** from the same origin: the **superadmin** panel (manages all companies) and every individual **tenant company's** own portal (login, dashboard, Employees/Customers CRUD). Which one you're looking at is decided entirely by the URL — `/__superadmin/*` vs `/:companySlug/*` — not by separate deployments or subdomains.

Because both audiences share one browser, one origin, and one codebase, three problems have to be solved deliberately, and each has a dedicated mechanism described below:

1. **Two logins must coexist without clobbering each other** → namespaced session storage (§3).
2. **The UI must re-skin itself per company** (name, logo, brand colors) **before the user even logs in** → `TenantContext` + CSS custom properties (§4).
3. **Every company can have a different set of Employee/Customer columns** → schema-driven CRUD, no hardcoded forms (§5).

```
┌─────────────────────────────────────────────────────────────────┐
│                        React SPA (one origin)                    │
│                                                                    │
│   /__superadmin/*  ──────────────►  Superadmin session            │
│   (panel, wizard, browse-any-       (superadmin_access_token)     │
│    company's-data views)                                          │
│                                                                    │
│   /:companySlug/*  ──────────────►  Tenant-user session            │
│   (that company's own login,        (tenant_access_token +         │
│    dashboard, Employees/Customers)   tenant_slug)                  │
│                                                                    │
│   Both call the same Django API at VITE_API_BASE_URL              │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| UI | React 19 | function components + hooks only, no class components |
| Routing | react-router-dom 7 | plain `<Routes>/<Route>`, no data routers/loaders |
| HTTP | axios | one configured instance (`src/api/client.js`) with interceptors |
| Styling | Tailwind CSS 4 | CSS-first config (`@theme` in `src/index.css`), no `tailwind.config.js` |
| Build | Vite 8 | `@vitejs/plugin-react` + `@tailwindcss/vite`, no proxy — frontend and backend are separate origins coordinated via CORS |
| Lint | oxlint | Rust-based, fast |
| State | none (no Redux/Zustand/React Query) | plain `useState` + `useEffect` + axios per component |
| Tests | none currently | — |

No aliasing or proxying in `vite.config.js` — it's literally:
```js
export default defineConfig({ plugins: [react(), tailwindcss()] })
```

## 3. Session model — two identities, one browser

**File:** `src/api/auth.js`

The hard requirement: a superadmin testing the panel and a company's own logged-in user must be able to exist in the *same browser* (even the same tab, across navigations) without one login silently evicting the other. This didn't hold originally — both wrote to the same `access_token`/`role` keys, so logging into any company kicked out the superadmin session, and vice versa. The fix namespaces everything by domain:

```js
const DOMAIN_KEYS = {
  superadmin:  { access: 'superadmin_access_token', refresh: 'superadmin_refresh_token', seed: 'superadmin_session_seed' },
  tenant_user: { access: 'tenant_access_token',      refresh: 'tenant_refresh_token',      seed: 'tenant_session_seed', slug: 'tenant_slug' },
};
```

- `setSession({access, refresh, role, tenant, username})` writes into the right namespace only.
- `handleAuthExpired(role)` clears **only** the affected domain and redirects (superadmin → `/__superadmin`, tenant user → `/${tenantSlug}/login`) — the other domain's session is untouched.
- Every login also stamps a fresh `session_seed` (`${username||role}-${Date.now()}`) used purely to reseed the `Avatar` identicon, so the same user gets a visually different (but session-stable) avatar each time they sign back in.

### Request routing: which token goes on which request?

**File:** `src/api/client.js`

A single axios instance is shared by both domains. Each outgoing request resolves which token it needs:

```js
function resolveDomain(config) {
  if (config.authDomain) return config.authDomain;               // explicit override
  const url = config.url || '';
  return url.startsWith('/superadmin') || url.startsWith('/auth/superadmin')
    ? 'superadmin'
    : 'tenant_user';                                              // default guess
}
```

The URL-shape guess is right almost everywhere — except one case: a superadmin *browsing a specific company's Employees/Customers* hits the exact same tenant-shaped URL (`/oneplus/employees/`) a real logged-in OnePlus user would, but must authenticate with the **superadmin's** token, not a (likely nonexistent) OnePlus tenant-user token. That's what the explicit `authDomain` override is for — see §5's `asSuperAdmin` flag.

The response interceptor treats a `401`, or a `403` whose body is *exactly* `"Authentication credentials were not provided."`, as "not logged in" and calls `handleAuthExpired(domain)`. It deliberately does **not** do this for any other 403 message, because a 403 can also mean a legitimate, scoped permission denial (e.g. a tenant user hitting another company's data) — forcing a logout there would be wrong.

### Route guards

**File:** `src/components/RequireAuth.jsx`

- `RequireSuperAdmin` — redirects to `/__superadmin` if no superadmin token exists.
- `RequireTenantUser({ slug })` — redirects to `/${slug}/login` if there's no tenant token, **or** the stored `tenant_slug` doesn't match the route's own slug (this catches a stale bookmark/link left over from being logged into a *different* company).

These are plain wrapper components used directly in JSX (`<RequireSuperAdmin><Page/></RequireSuperAdmin>`), not a router-level `loader` abstraction — more repetitive, but easy to read at each route declaration.

## 4. Routing structure

**File:** `src/App.jsx` — one flat `<Routes>` tree (no nested layouts beyond `TenantRoutes`).

```
/                                                    → redirect to /__superadmin

/__superadmin                                        → superadmin login
/__superadmin/dashboard                              → Companies table
/__superadmin/field-catalog                          → master field catalog editor

/__superadmin/onboard                                ┐
/__superadmin/onboard/modules                        │  5-step CREATE wizard —
/__superadmin/onboard/modules/tier-plan              │  one real, bookmarkable
/__superadmin/onboard/modules/tier-plan/limits       │  URL per step
/__superadmin/onboard/modules/tier-plan/limits/fields┘

/__superadmin/companies/:slug/edit                   ┐
/__superadmin/companies/:slug/edit/modules           │  same 5 steps, EDIT mode —
/__superadmin/companies/:slug/edit/.../tier-plan     │  same component as above
/__superadmin/companies/:slug/edit/.../limits        │
/__superadmin/companies/:slug/edit/.../fields        ┘

/__superadmin/companies/:slug/employees              ┐
/__superadmin/companies/:slug/customers              │  superadmin browsing one
/__superadmin/companies/:slug/fields                 │  company's data/config
/__superadmin/companies/:slug/users                  │  directly (superadmin JWT)
/__superadmin/companies/:slug/limits                 ┘

/:companySlug/*                                      → TenantRoutes (see below)
```

All ten onboarding-wizard routes render the **same** `OnboardCompanyPage` component. `isEditMode = Boolean(slug)` (from `useParams()`) and the current step index (`STEPS.findIndex(s => s.path === location.pathname)`) are both *derived from the URL*, not separate component trees — so the browser's back/forward buttons and bookmarks work step-by-step for free.

`TenantRoutes` reads `companySlug` via `useParams()`, wraps its children in `<TenantProvider>` (§4 below… actually §5), and defines its own nested routes: `login`, `dashboard`, `employees`, `customers` — the latter three wrapped in `RequireTenantUser`.

## 5. Multi-tenant branding: resolving "which company is this, and how does it look?"

**Files:** `src/context/TenantContext.jsx`, `src/pages/tenant/LoginPage.jsx`

`TenantProvider` reads the slug from the URL and calls the one **unauthenticated** tenant-facing endpoint, `publicService.getTenantInfo(slug)` → `GET /${slug}/public-info/`, so a company's branding (name, logo, colors, enabled features) can render on its login page *before* anyone has signed in. It exposes `{ slug, tenant, loading, error }` via a `useTenant()` hook.

Branding is applied without any component-level color logic — the tenant's `primary_color`/`secondary_color` (falling back to the default butter/near-black look) are set as CSS custom properties on the page root:

```js
const themeVars = { '--tenant-primary': primaryColor, '--tenant-secondary': secondaryColor };
```

...which Tailwind arbitrary-value classes (`bg-[var(--tenant-primary)]`) and a dedicated CSS rule in `src/index.css` then consume:

```css
.tenant-cta {
  background: var(--tenant-primary, #ffda47);
}
.tenant-cta:hover {
  background: color-mix(in srgb, var(--tenant-primary) 85%, white);
}
```

`color-mix()` computes the hover shade in pure CSS — no JavaScript needed to darken/lighten a color that isn't known until runtime. The decorative floating shapes behind the login form (`AuthDecor`) similarly accept `primary`/`secondary` props so the whole page — not just the button — retints itself per company.

The tenant's logo (`tenant.logo_url`) appears wherever branding shows up (login page, dashboard header via `AppHeader`), falling back to a generated `Avatar` identicon or an emoji badge when the company hasn't uploaded one.

## 6. Schema-driven CRUD: one screen for every entity, every tenant

This is the piece that lets "Tata has 8 employee columns, Tesla has 14" work without per-tenant frontend code.

**File:** `src/services/entityService.js` (23 lines, full factory)

```js
export function createEntityService(slug, entity, { asSuperAdmin = false } = {}) {
  const base = `/${slug}/${entity}`;
  const config = { authDomain: asSuperAdmin ? 'superadmin' : 'tenant_user' };
  return {
    getSchema:  () => apiClient.get(`${base}/schema/`, config),
    create:     (data) => apiClient.post(`${base}/`, data, config),
    read:       (params) => apiClient.get(`${base}/`, { ...config, params }),
    readById:   (id) => apiClient.get(`${base}/${id}/`, config),
    update:     (id, data) => apiClient.patch(`${base}/${id}/`, data, config),
    delete:     (id) => apiClient.delete(`${base}/${id}/`, config),
  };
}
```

One factory serves both `employees` and `customers` (and any future entity) — adding a third module needs no new service code, just a new `entity` string. The `asSuperAdmin` flag is the `authDomain` override from §3, threaded in by whichever page constructs the service.

**File:** `src/pages/modules/shared/EntityManager.jsx` — the actual generic screen. Instead of a hardcoded form/table per entity, it:

1. Fetches `GET /<slug>/<entity>/schema/` alongside the first page of rows.
2. Builds the add-form's initial state directly from the schema's field keys (skipping any `readonly` field, e.g. a server-generated code).
3. Maps each field's backend `data_type` (`string`, `enum`, `integer`, `date`, `boolean`, `email`, `text`) to an HTML `<input type>` via a lookup table — the table and both forms (add + inline edit) are rendered by iterating the schema, not by naming fields explicitly.
4. Handles create/inline-edit/delete, throttling submit/delete (`useThrottledCallback`, 600ms) against accidental double-clicks.
5. Unwraps DRF's error shapes defensively — a `ValidationError(str)` on the backend serializes as a bare list (`["You've reached the 4-record limit..."]`), not `{detail: "..."}`, so `extractErrorMessage()` checks both shapes.
6. Special-cases the Trial-tier record-cap error (matched by the substring "upgrade to enterprise", deliberately tied to the exact backend wording) to show an "upgrade" banner instead of a generic red error line.

```
EmployeesTenantView / EmployeesSuperAdminView
        │ (same component, different props)
        ▼
   <EntityManager slug entity="employees" readOnly? asSuperAdmin? />
        │
        ├─► createEntityService(slug, "employees", {asSuperAdmin})
        │        └─► GET /<slug>/employees/schema/   (drives the form/table)
        │        └─► GET /<slug>/employees/?page=N   (drives the rows)
        │
        └─► renders form + table purely from the schema response
```

The exact same `EntityManager` backs four page components (`Employees{Tenant,SuperAdmin}View`, `Customers{Tenant,SuperAdmin}View`) — they differ only in the header/title they pass in, whether `readOnly` (mirrors the backend's Basic-plan restriction; never set for superadmin views), and `asSuperAdmin`.

## 7. Service layer (`src/services/`)

One thin object per backend resource — no caching, no business logic, just named methods wrapping `apiClient`:

| Service | Wraps |
|---|---|
| `tenantsService.js` | Superadmin tenant registry: CRUD on `/superadmin/tenants/`, `suspend`/`reactivate`/`retryProvisioning`, plus per-tenant sub-resources (`modules`, `field-config`, `table-limits`, `users`). Also `findBySlug()` — fetches the list and finds client-side, since most "company config" pages only have a slug from the URL and need the tenant's numeric id first. |
| `fieldCatalogService.js` | CRUD on `/superadmin/field-catalog/` — the master list of possible Employee/Customer fields. |
| `entityService.js` | The dynamic-schema factory from §6. |
| `authService.js` | `superAdminLogin()` → `POST /auth/superadmin/login/`; `tenantLogin(slug, ...)` → `POST /${slug}/auth/login/`. |
| `publicService.js` | `getTenantInfo(slug)` → `GET /${slug}/public-info/`, the one unauthenticated tenant-facing call. |

Components never call `apiClient` directly for these resources — always through the matching service.

## 8. The onboarding wizard

**File:** `src/pages/superadmin/OnboardCompanyPage.jsx` (~760 lines) — the most involved single component in the app.

**Steps:** Company → Modules → Tier & Plan → Limits → Fields, defined once (`STEP_META`) and turned into concrete paths by `buildSteps(basePath)`, where `basePath` switches between the onboard-wizard prefix and the edit-wizard prefix. See §4 for how routing and step index derive from this.

**Create vs. edit, one component:**
- Edit mode (`slug` present) loads the existing tenant (`tenantsService.findBySlug`), its table limits, and its field config, pre-filling every piece of local state.
- Create mode instead loads the master field catalog and starts every field disabled.

**Tier vs. Plan are modeled as independent axes** (a subtlety worth calling out because it looks redundant at first glance): *tier* caps how many records a table can hold; *plan* controls whether CRUD is available at all. A Trial tenant still gets full create/edit/delete — just capped at a small record count — so defaulting the *plan* selector to Enterprise (even though tier defaults to Trial) avoids silently handing a new tenant a read-only UI.

**Logo upload + preview:** `logo` state holds only a raw `File`, never a URL. A `useEffect` creates an object URL (`URL.createObjectURL`) whenever a new file is picked and revokes the previous one on change/unmount. The thumbnail shown is:
```js
const logoThumbnailUrl = logoPreviewUrl || (isEditMode ? currentLogoUrl : null);
```
— i.e. prefer a live preview of whatever's about to be saved over the already-stored server logo, so the field always shows what will actually happen on submit.

**Async provisioning + polling** (create flow): tenant DB creation runs as a Celery background task server-side, so the wizard can't assume the tenant is ready the instant `create()` returns. `waitForProvisioning()` polls `tenantsService.readById` every 2s for up to ~60s, watching `provisioning_status` for `ready`/`failed`. On success, previously-collected table limits and field config (which couldn't be applied before the tenant/DB existed) are applied and the wizard navigates to the dashboard. On failure, a retry button re-enters the same poll loop; on timeout, an escape hatch lets the superadmin bail to the dashboard since provisioning may still finish server-side.

**A submit-button footgun avoided on purpose:** the primary action button is always `type="button"` with one stable `onClick`, never a `type="submit"` button swapped in at the same screen position once the last step is reached. Browsers resolve a click's default action using the button's *type at the end of the click event* — so a same-position button that flips `button → submit` mid-click would auto-submit the form the instant the user lands on the final step. Enter-key submission is preserved separately via a real `<form onSubmit>` wired to the same handler.

## 9. UI component library (`src/components/ui/`)

A small, consistent design system, not a generic kit — several pieces encode real product rules:

- **`Button`** — variants are *semantic*, not just visual: `create` (green), `update` (blue), `destructive` (red), `primary` (brand butter), `secondary`, `ghost`, `accent` — "every action gets its own color so the screen reads at a glance."
- **`Avatar`** — a deterministic **GitHub-style identicon** (`src/utils/identicon.js`): hash the seed string → seed a `mulberry32` PRNG → generate a 5×5 left-right-symmetric boolean grid + a random hue → render as inline SVG `<rect>`s. No network call, no external identicon library — purely local and reproducible from the same seed (see the per-login `session_seed` in §3).
- **`ColorField`** — pairs a native color-picker input with a synced hex-text input, validating `/^#[0-9A-Fa-f]{6}$/`; backs the onboarding wizard's brand-color pickers.
- **`AuthCard`** — a glassmorphic login card with real-time 3D tilt toward the cursor; the tilt transform is written straight to `style.transform` via a ref rather than through React state, avoiding a re-render on every `mousemove`.
- **`AuthDecor`** — purely decorative floating shapes behind login screens, retintable via `primary`/`secondary` props to match a tenant's brand colors.
- **`Pagination`** — generic, driven entirely by `{page, pageSize, count}` — matches DRF's `PageNumberPagination` response shape directly.
- **`PageShell` / `AppHeader`** — the shared page chrome; `AppHeader` takes a `sessionDomain` prop so its avatar/logout button read from the *correct* namespaced session (§3) regardless of which audience is viewing it.
- Standard set rounding it out: `Card`, `Input`/`Select`/`Label`, `Modal`, `Badge`, `Spinner`, `Checkbox`, `EmptyState`.

## 10. Styling

**File:** `src/index.css` — Tailwind v4's CSS-first configuration; there is no `tailwind.config.js`. A custom **"butter" color scale** (`--color-butter-50…900`, warm yellow/gold) is declared in an `@theme` block, making `bg-butter-400`, `text-butter-700`, etc. available everywhere as the brand palette instead of hardcoded hex values scattered through components.

No dark mode is implemented — `body` sets a fixed light background/foreground and `Inter` as the base font, with no `prefers-color-scheme` handling anywhere in the CSS or components.

Ambient login-page motion (`auth-float-a/b/c`, `auth-blob`, `auth-spin-slow`, `auth-shimmer`) and small UI transitions (`wizard-step-enter`, `modal-pop`) are plain CSS `@keyframes`, each wrapped in `@media (prefers-reduced-motion: reduce)` guards that disable animation for users who've asked for it.

## 11. Hooks and utilities (`src/hooks/`, `src/utils/`)

- **`useDebouncedValue(value, delay=300)`** (`useDebounce.js`) — standard debounced-value hook for search-driven fetches.
- **`useThrottledCallback(fn, wait=300)`** (`useThrottledCallback.js`) — wraps the plain (non-React) `throttle()` in `src/utils/throttle.js` in a `useMemo`, keeping a `useRef` to always invoke the *latest* `fn` closure without re-creating the throttled wrapper on every render. Used to guard "buttons that could be clicked repeatedly" (submit/delete) in `EntityManager`.
- **`src/utils/identicon.js`** — the pure-function identicon generator behind `Avatar` (§9); no component/hook dependencies, easily unit-testable in isolation.

## 12. Single source of truth for modules (`src/config/modules.js`)

Mirrors the backend's `tenants/entities.py` deliberately: `AVAILABLE_MODULES` lists `employees`/`customers` with labels/descriptions, and the file is explicitly commented that adding a third module means one entry here **and** one entry in the backend's `entities.py` — nothing else. It also mirrors `TRIAL_RECORD_LIMIT = 4` from the backend (for use in the wizard before a tenant/its real value exists) and defines the `PLAN_INFO`/`MAX_RECORDS_OPTIONS` used by the Tier & Plan and Limits wizard steps.

---

**Key files, all under `frontend/`:**
`src/App.jsx` · `src/api/{auth,client}.js` · `src/components/RequireAuth.jsx` · `src/context/TenantContext.jsx` · `src/services/{entityService,tenantsService,fieldCatalogService,authService,publicService}.js` · `src/pages/modules/shared/EntityManager.jsx` · `src/pages/superadmin/OnboardCompanyPage.jsx` · `src/pages/tenant/{LoginPage,DashboardPage}.jsx` · `src/config/modules.js` · `src/components/ui/*.jsx` · `src/hooks/*.js` · `src/utils/{throttle,identicon}.js` · `src/index.css`
