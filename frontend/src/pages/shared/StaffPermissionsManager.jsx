import { useEffect, useMemo, useState } from 'react';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import Checkbox from '../../components/ui/Checkbox';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import PageShell from '../../components/ui/PageShell';
import Spinner from '../../components/ui/Spinner';
import { createStaffService } from '../../services/staffService';

/**
 * Which of the company's own Superadmin-enabled modules/fields (see
 * TenantEntitlementsView) each staff login can see/edit. Shared between the
 * company owner's own page (pages/tenant/StaffPermissionsPage) and
 * Superadmin's per-company page (pages/superadmin/CompanyStaffPermissionsPage)
 * — same pattern as modules/shared/EntityManager being reused by both a
 * tenant view and a Superadmin view.
 *
 * Owners implicitly have full access and aren't editable here — see
 * core_auth.models.StaffProfile/StaffModuleGrant/StaffFieldGrant.
 */
export default function StaffPermissionsManager({ slug, title, subtitle, header, asSuperAdmin = false }) {
  const service = useMemo(() => createStaffService(slug, { asSuperAdmin }), [slug, asSuperAdmin]);

  const [entitlements, setEntitlements] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeUsername, setActiveUsername] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [entitlementsRes, staffRes] = await Promise.all([
        service.readEntitlements(),
        service.readStaffList(),
      ]);
      setEntitlements(entitlementsRes.data);
      setStaff(staffRes.data);
    } catch (err) {
      setError(
        err.response?.status === 403
          ? 'Only this company\'s owner (or Superadmin) can manage staff permissions.'
          : 'Failed to load staff permissions.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (loading) return <PageShell header={header}><Spinner /></PageShell>;
  if (error) return <PageShell header={header}><p className="text-red-600">{error}</p></PageShell>;

  return (
    <PageShell maxWidth="max-w-4xl" header={header}>
      <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
      <p className="mt-1 mb-8 text-sm text-neutral-600">
        {subtitle || 'Choose which modules and fields each staff login can see and edit, within what Superadmin has enabled for this company.'}
      </p>

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-6 py-3.5 font-medium">Username</th>
              <th className="px-6 py-3.5 font-medium">Role</th>
              <th className="px-6 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {staff.map((user) => (
              <tr key={user.username} className="transition hover:bg-butter-50">
                <td className="px-6 py-4 font-mono text-neutral-900">{user.username}</td>
                <td className="px-6 py-4">
                  <Badge variant={user.role === 'owner' ? 'accent' : 'neutral'}>
                    {user.role === 'owner' ? 'Owner — full access' : 'Staff'}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-right">
                  {user.role !== 'owner' && (
                    <button
                      onClick={() => setActiveUsername(user.username)}
                      className="text-xs font-medium text-sky-600 transition hover:text-sky-500"
                    >
                      Manage permissions
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr>
                <td colSpan={3}>
                  <EmptyState icon="🔑" title="No staff logins yet" hint="Ask Superadmin to create one for this company." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {activeUsername && (
        <PermissionModal
          service={service}
          username={activeUsername}
          entitlements={entitlements}
          onClose={() => setActiveUsername(null)}
        />
      )}
    </PageShell>
  );
}

/** Builds { [module_key]: { can_view, can_edit, fields: { [field_key]: { can_view, can_edit } } } }
 * from the company's entitlements (the full set that can be granted) merged
 * with this staff user's current grants (anything not present = ungranted). */
function buildGrantState(entitlements, currentGrants) {
  const grantsByModule = Object.fromEntries(currentGrants.map((g) => [g.module_key, g]));

  return Object.fromEntries(entitlements.map((module) => {
    const grant = grantsByModule[module.module_key];
    const fieldsByKey = Object.fromEntries((grant?.fields || []).map((f) => [f.field_key, f]));

    return [module.module_key, {
      can_view: grant?.can_view || false,
      can_edit: grant?.can_edit || false,
      fields: Object.fromEntries(module.fields.map((field) => [field.field_key, {
        can_view: fieldsByKey[field.field_key]?.can_view || false,
        can_edit: fieldsByKey[field.field_key]?.can_edit || false,
      }])),
    }];
  }));
}

function grantStateToPayload(grantState) {
  return Object.entries(grantState).map(([moduleKey, module]) => ({
    module_key: moduleKey,
    can_view: module.can_view,
    can_edit: module.can_edit,
    fields: Object.entries(module.fields)
      .filter(([, field]) => field.can_view || field.can_edit)
      .map(([fieldKey, field]) => ({ field_key: fieldKey, can_view: field.can_view, can_edit: field.can_edit })),
  }));
}

function PermissionModal({ service, username, entitlements, onClose }) {
  const [grantState, setGrantState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    service.readPermissions(username)
      .then((res) => {
        if (!cancelled) setGrantState(buildGrantState(entitlements, res.data));
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load current permissions.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const setModule = (moduleKey, patch) => {
    setGrantState((prev) => ({ ...prev, [moduleKey]: { ...prev[moduleKey], ...patch } }));
  };

  const setField = (moduleKey, fieldKey, patch) => {
    setGrantState((prev) => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        fields: {
          ...prev[moduleKey].fields,
          [fieldKey]: { ...prev[moduleKey].fields[fieldKey], ...patch },
        },
      },
    }));
  };

  const toggleModuleView = (moduleKey, checked) => {
    // Turning off module view hides every field under it too — a field
    // can't be visible in a module the staff user can't open.
    setGrantState((prev) => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        can_view: checked,
        can_edit: checked ? prev[moduleKey].can_edit : false,
        fields: checked
          ? prev[moduleKey].fields
          : Object.fromEntries(Object.keys(prev[moduleKey].fields).map((k) => [k, { can_view: false, can_edit: false }])),
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await service.updatePermissions(username, grantStateToPayload(grantState));
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not save permissions.');
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Permissions for ${username}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="update" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving...' : 'Save permissions'}
          </Button>
        </>
      )}
    >
      {loading ? (
        <Spinner />
      ) : entitlements.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No modules are enabled for this company yet — ask Superadmin to enable one first.
        </p>
      ) : (
        <div className="max-h-[60vh] space-y-6 overflow-y-auto">
          {entitlements.map((module) => {
            const state = grantState[module.module_key];
            return (
              <div key={module.module_key}>
                <label className="flex items-center gap-3 text-sm font-medium text-neutral-900">
                  <Checkbox
                    checked={state.can_view}
                    onChange={(e) => toggleModuleView(module.module_key, e.target.checked)}
                  />
                  {module.label}
                </label>
                {state.can_view && (
                  <div className="mt-2 ml-7 space-y-3">
                    <label className="flex items-center gap-2 text-xs text-neutral-500">
                      <Checkbox
                        checked={state.can_edit}
                        onChange={(e) => setModule(module.module_key, { can_edit: e.target.checked })}
                      />
                      Can create/edit/delete {module.label.toLowerCase()} records (not just view)
                    </label>

                    {module.fields.length === 0 ? (
                      <p className="text-xs text-neutral-400">No configurable fields for this module.</p>
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-neutral-200">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-neutral-50 text-neutral-500">
                            <tr>
                              <th className="px-4 py-2 font-medium">Field</th>
                              <th className="px-4 py-2 font-medium">Visible</th>
                              <th className="px-4 py-2 font-medium">Editable</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100">
                            {module.fields.map((field) => {
                              const fieldState = state.fields[field.field_key];
                              return (
                                <tr key={field.field_key}>
                                  <td className="px-4 py-2 text-neutral-800">{field.label}</td>
                                  <td className="px-4 py-2">
                                    <Checkbox
                                      checked={fieldState.can_view}
                                      onChange={(e) => setField(module.module_key, field.field_key, {
                                        can_view: e.target.checked,
                                        can_edit: e.target.checked ? fieldState.can_edit : false,
                                      })}
                                    />
                                  </td>
                                  <td className="px-4 py-2">
                                    <Checkbox
                                      checked={fieldState.can_edit}
                                      disabled={!fieldState.can_view || !state.can_edit}
                                      onChange={(e) => setField(module.module_key, field.field_key, { can_edit: e.target.checked })}
                                      className="disabled:opacity-40"
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
