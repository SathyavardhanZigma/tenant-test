import { useMemo, useRef } from 'react';
import { throttle } from '../utils/throttle';

/** Stable, throttled version of a callback — use on buttons that could be
 * clicked repeatedly (submit, delete, pagination) or on scroll/resize
 * handlers, so rapid repeats collapse into one call per `wait` window. */
export function useThrottledCallback(fn, wait = 300) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  return useMemo(
    () => throttle((...args) => fnRef.current(...args), wait),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wait],
  );
}
