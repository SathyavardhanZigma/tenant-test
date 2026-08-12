import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AppHeader from '../../components/ui/AppHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import Checkbox from '../../components/ui/Checkbox';
import Input from '../../components/ui/Input';
import PageShell from '../../components/ui/PageShell';
import Spinner from '../../components/ui/Spinner';
import { SUPERADMIN_LINKS } from './links';
import { tenantsService } from '../../services/tenantsService';

/** Zigma-side capability configuration for one company.
 *
 * Renders the registry as a tree (from the backend's `tree`) rather than a flat
 * checkbox list, so parent/child relationships are visible — turning off a
 * parent visibly greys its children instead of silently overriding them.
 *
 * The tier badges are the point of the screen: LOCKED rows are read-only
 * product invariants, TUNABLE rows are what Zigma may set per tenant. That
 * distinction is what makes "our default product" definable — see the
 * override counter in the header. */
export default function CompanyCapabilitiesPage() {
  const { slug } = useParams();
  const [tenantId, setTenantId] = useState(null);
  const [tree, setTree] = useState([]);
  const [effective, setEffective] = useState({});
  const [overrideCount, setOverrideCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const tenant = await tenantsService.findBySlug(slug);
      if (!tenant) {
        setMessage({ kind: 'error', text: 'Company not found.' });
        return;
      }
      setTenantId(tenant.id);
      const response = await tenantsService.readCapabilities(tenant.id);
      setTree(response.data.tree);
      setEffective(response.data.effective);
      setOverrideCount(response.data.override_count);
    } catch {
      setMessage({ kind: 'error', text: 'Could not load capabilities.' });
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  /** Local edit of one capability's enabled flag or a single setting. Kept in
   * `effective` so the tree re-renders (including cascade greying) before the
   * round-trip — the backend remains the authority on resolve. */
  const setEnabled = (key, enabled) =>
    setEffective((prev) => ({ ...prev, [key]: { ...prev[key], enabled } }));

  const setSetting = (key, name, value) =>
    setEffective((prev) => ({
      ...prev,
      [key]: { ...prev[key], settings: { ...prev[key].settings, [name]: value } },
    }));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Only send tunable/packaged rows — locked ones are rejected by the API
      // by design, so filtering here keeps the request honest.
      const rows = Object.entries(effective)
        .filter(([, value]) => value.tier !== 'locked')
        .map(([key, value]) => ({
          key,
          enabled: value.enabled,
          settings: value.settings,
        }));
      await tenantsService.updateCapabilities(tenantId, rows);
      setMessage({ kind: 'success', text: 'Capabilities saved.' });
      await load();
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err.response?.data?.detail || 'Could not save capabilities.',
      });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await tenantsService.resetCapabilities(tenantId);
      setMessage({ kind: 'success', text: response.data.detail });
      await load();
    } catch {
      setMessage({ kind: 'error', text: 'Could not reset to default product.' });
    } finally {
      setSaving(false);
    }
  };

  const header = <AppHeader brand="Superadmin" brandIcon="🛠" brandHref="/__superadmin/dashboard" links={SUPERADMIN_LINKS} />;

  return (
    <PageShell maxWidth="max-w-4xl" header={header}>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Capabilities — {slug}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            What this company's product looks like. Zigma sets the ceiling here; the company's own
            admin manages users and screens inside it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {overrideCount === 0 ? (
            <Badge variant="success">Default product</Badge>
          ) : (
            <Badge variant="accent">
              {overrideCount} override{overrideCount === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`mb-6 rounded-lg px-4 py-3 text-sm ${
            message.kind === 'success'
              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20'
              : 'bg-red-50 text-red-700 ring-1 ring-red-600/10'
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Product capabilities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 py-2">
              {tree.map((node) => (
                <CapabilityNode
                  key={node.key}
                  node={node}
                  depth={0}
                  effective={effective}
                  onToggle={setEnabled}
                  onSetting={setSetting}
                />
              ))}
            </CardContent>
          </Card>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="update" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save configuration'}
            </Button>
            <Button variant="secondary" onClick={reset} disabled={saving || overrideCount === 0}>
              Reset to default product
            </Button>
          </div>
        </>
      )}
    </PageShell>
  );
}

/** One registry node plus its settings and children, indented by depth.
 * `inheritedOff` propagates a disabled ancestor down the tree so children
 * render as unavailable — mirroring the backend's cascade in
 * tenants/capabilities.py:_apply_cascade. */
function CapabilityNode({ node, depth, effective, onToggle, onSetting, inheritedOff = false }) {
  const state = effective[node.key];
  if (!state) return null;

  const locked = state.tier === 'locked';
  const effectivelyOff = inheritedOff || !state.enabled;
  const settingNames = Object.keys(node.settings_schema);

  return (
    <div>
      <div
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${inheritedOff ? 'opacity-45' : ''}`}
        style={{ marginLeft: depth * 20 }}
      >
        <Checkbox
          checked={state.enabled}
          disabled={locked || inheritedOff}
          onChange={(e) => onToggle(node.key, e.target.checked)}
        />
        <span className="flex-1 text-sm font-medium text-neutral-800">{node.label}</span>

        {state.is_overridden && !locked && (
          <span className="text-xs text-butter-800" title="Differs from the product default">
            overridden
          </span>
        )}
        <Badge variant={locked ? 'neutral' : 'accent'} className="shrink-0">
          {locked ? 'locked' : node.tier}
        </Badge>
      </div>

      {/* Settings only make sense while the capability is actually on. */}
      {settingNames.length > 0 && !effectivelyOff && (
        <div className="mb-2 space-y-2.5" style={{ marginLeft: depth * 20 + 31 }}>
          {settingNames.map((name) => (
            <SettingRow
              key={name}
              name={name}
              spec={node.settings_schema[name]}
              value={state.settings[name]}
              onChange={(value) => onSetting(node.key, name, value)}
            />
          ))}
        </div>
      )}

      {node.children.map((child) => (
        <CapabilityNode
          key={child.key}
          node={child}
          depth={depth + 1}
          effective={effective}
          onToggle={onToggle}
          onSetting={onSetting}
          inheritedOff={effectivelyOff}
        />
      ))}
    </div>
  );
}

/** Renders one setting from its schema entry — the input type comes from the
 * registry, so adding a setting backend-side needs no change here. */
function SettingRow({ name, spec, value, onChange }) {
  const label = name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

  return (
    <div className="flex items-center gap-3">
      {spec.type === 'boolean' && (
        <>
          <Checkbox checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          <span className="text-sm text-neutral-600">{label}</span>
        </>
      )}

      {spec.type === 'integer' && (
        <>
          <span className="w-40 text-sm text-neutral-600">{label}</span>
          <Input
            type="number"
            min={spec.min}
            max={spec.max}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-24"
          />
          <span className="text-xs text-neutral-400">
            {spec.min}–{spec.max}
          </span>
        </>
      )}

      {spec.type === 'enum' && (
        <>
          <span className="w-40 text-sm text-neutral-600">{label}</span>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 focus:border-butter-400 focus:outline-none focus:ring-2 focus:ring-butter-500/30"
          >
            {spec.choices.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        </>
      )}

      {spec.help && <span className="text-xs text-neutral-400">{spec.help}</span>}
    </div>
  );
}
