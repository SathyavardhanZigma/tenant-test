/** Wraps a function so it can run at most once per `wait` ms — for scroll,
 * resize, or spammable-button handlers where every call would otherwise
 * trigger redundant work (re-renders, network requests, layout thrash). */
export function throttle(fn, wait = 300) {
  let lastCall = 0;
  let timeoutId = null;

  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - lastCall);

    if (remaining <= 0) {
      lastCall = now;
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn(...args);
      }, remaining);
    }
  };
}
