import { createContext, useContext, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicService } from '../services/publicService';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const { companySlug } = useParams();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!companySlug) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    // Public tenant branding lookup (logo/company name) — resolved from the
    // URL slug before login, per the config/tenant-onboarding flow.
    publicService
      .getTenantInfo(companySlug)
      .then((response) => {
        if (!cancelled) setTenant(response.data);
      })
      .catch(() => {
        if (!cancelled) setError('Company not found.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companySlug]);

  return (
    <TenantContext.Provider value={{ slug: companySlug, tenant, loading, error }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
