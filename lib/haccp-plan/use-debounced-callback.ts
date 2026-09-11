"use client";

import { useCallback, useEffect, useRef } from "react";

export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delay: number
) {
  const fnRef = useRef(fn);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    return () => window.clearTimeout(timerRef.current);
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        fnRef.current(...args);
      }, delay);
    },
    [delay]
  );
}
