import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clearSession, getSessionSeed } from '../../api/auth';
import AppHeader from '../../components/ui/AppHeader';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import PageShell from '../../components/ui/PageShell';
import Spinner from '../../components/ui/Spinner';
import { useTenant } from '../../context/TenantContext';
import { dashboardService } from '../../services/dashboardService';

const ENTITY_ICON = { employee: '👥', customer: '🤝' };

/** The dashboard renders from the backend payload rather than from a local
 * list of widgets: whichever sections Zigma enabled for this tenant are the
 * keys that exist on the response (see backend/tenants/dashboard.py). Adding a
 * widget to the product means adding it to the capability registry and here —
 * never a per-tenant branch. */
export default function DashboardPage() {
  const { slug, tenant } = useTenant();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!slug) return undefined;

    let cancelled = false;
    setLoading(true);
    setError(null);

    dashboardService
      .read(slug)
      .then((response) => {
        if (!cancelled) setData(response.data);
      })
      .catch((err) => {
        if (cancelled) return;
        // 403 FEATURE_NOT_ENABLED is a legitimate product state (Zigma turned
        // the whole dashboard off for this tenant), not a failure to report as
        // a broken page.
        setError(
          err.response?.status === 403
            ? 'The dashboard is not enabled for your company.'
            : 'Could not load your dashboard.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const header = (
    <AppHeader
      brand={tenant?.company_name || slug}
      brandIcon="🏢"
      brandHref={`/${slug}/dashboard`}
      links={buildTenantLinks(slug, tenant)}
      onLogout={() => {
        clearSession();
        navigate(`/${slug}/login`);
      }}
    />
  );

  return (
    <PageShell maxWidth="max-w-5xl" header={header}>
      <div className="mb-10 flex items-center gap-4">
        {tenant?.logo_url ? (
          <img src={tenant.logo_url} alt="" className="size-14 rounded-xl object-cover ring-1 ring-neutral-200" />
        ) : (
          <Avatar seed={getSessionSeed()} size={56} className="rounded-xl ring-1 ring-neutral-200" />
        )}
        <div className="flex-1">
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900">
            Welcome back, {tenant?.company_name || slug}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">Here's the latest across your company.</p>
        </div>
        {data?.tier === 'trial' && <Badge variant="accent">Trial</Badge>}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {!loading && error && <EmptyState icon="🔒" title="Dashboard unavailable" hint={error} />}

      {!loading && !error && data && (
        <div className="space-y-6">
          {data.stats && <StatsSection tiles={data.stats} />}
          {data.recent_activity && <RecentActivitySection rows={data.recent_activity} />}
          {data.module_shortcuts && <ShortcutsSection slug={slug} cards={data.module_shortcuts} />}

          {!data.stats && !data.recent_activity && !data.module_shortcuts && (
            <EmptyState
              title="Nothing to show yet"
              hint="No dashboard sections are enabled for your company."
            />
          )}
        </div>
      )}
    </PageShell>
  );
}

function StatsSection({ tiles }) {
  if (tiles.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {tiles.map((tile) => (
        <Card key={tile.entity} className="p-6">
          <div className="flex items-start justify-between">
            <span className="flex size-11 items-center justify-center rounded-xl bg-butter-50 text-xl">
              {ENTITY_ICON[tile.entity]}
            </span>
            {/* usage_percent is only present when Zigma left limit usage on
             * AND the tenant actually has a limit configured. */}
            {tile.usage_percent != null && (
              <Badge variant={tile.usage_percent >= 80 ? 'danger' : 'neutral'}>
                {tile.usage_percent}% used
              </Badge>
            )}
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900">{tile.count}</p>
          <p className="mt-1 text-sm text-neutral-500">
            {tile.label}
            {tile.limit != null && (
              <span className="text-neutral-400"> · limit {tile.limit.toLocaleString()}</span>
            )}
          </p>
          {tile.usage_percent != null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div
                className={`h-full rounded-full ${tile.usage_percent >= 80 ? 'bg-red-500' : 'bg-butter-500'}`}
                style={{ width: `${Math.max(tile.usage_percent, 2)}%` }}
              />
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function RecentActivitySection({ rows }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-neutral-500">No records yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {rows.map((row) => (
              <li key={`${row.entity}-${row.code}`} className="flex items-center gap-3 px-6 py-3.5">
                <span className="text-base">{ENTITY_ICON[row.entity]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {row.title || row.code}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {row.label}
                    {row.title && <span className="text-neutral-400"> · {row.code}</span>}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-neutral-400">
                  {formatWhen(row.created_at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ShortcutsSection({ slug, cards }) {
  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {cards.map((card) => (
        <Link key={card.module_key} to={`/${slug}/${card.module_key}`}>
          <Card className="group h-full cursor-pointer p-7 transition hover:-translate-y-0.5 hover:border-butter-300 hover:shadow-lg hover:shadow-butter-500/10">
            <span className="flex size-11 items-center justify-center rounded-xl bg-butter-50 text-xl transition group-hover:bg-butter-100">
              {ENTITY_ICON[card.entity]}
            </span>
            <h2 className="mt-4 text-lg font-semibold text-neutral-900 group-hover:text-butter-800">
              {card.label}
            </h2>
            {card.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">{card.description}</p>
            )}
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-butter-800 opacity-0 transition group-hover:opacity-100">
              Open →
            </span>
          </Card>
        </Link>
      ))}
    </div>
  );
}

/** Compact relative time — avoids pulling in a date library for one label. */
function formatWhen(iso) {
  const then = new Date(iso);
  const minutes = Math.round((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return then.toLocaleDateString();
}

function buildTenantLinks(slug, tenant) {
  const links = [{ label: 'Dashboard', to: `/${slug}/dashboard` }];
  if (hasFeature(tenant, 'employees')) links.push({ label: 'Employees', to: `/${slug}/employees` });
  if (hasFeature(tenant, 'customers')) links.push({ label: 'Customers', to: `/${slug}/customers` });
  return links;
}

function hasFeature(tenant, featureKey) {
  return tenant?.features?.includes(featureKey);
}
