import { useEffect, useState } from 'react';

/** Debounces a fast-changing value (e.g. a search input) so dependent effects
 * (API calls) only fire `delay` ms after the user stops typing, instead of
 * on every keystroke. */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
