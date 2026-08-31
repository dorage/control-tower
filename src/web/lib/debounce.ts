import { useEffect, useMemo, useRef } from "react";

/**
 * Trailing-edge debounce bound to the component's lifetime.
 *
 * The callback is read through a ref, so passing a fresh arrow function on every render
 * does not reset the timer - only `delay` does. The pending timer is cleared on unmount,
 * which is what keeps a `change` event that arrives during navigation from calling into
 * a screen that is already gone.
 */
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delay: number,
): (...args: A) => void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return useMemo(
    () =>
      (...args: A) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          callbackRef.current(...args);
        }, delay);
      },
    [delay],
  );
}
