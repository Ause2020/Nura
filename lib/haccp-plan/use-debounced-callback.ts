"use client";

import { useCallback, useEffect, useRef } from "react";

export type DebouncedCallback<T extends (...args: never[]) => void> = ((
  ...args: Parameters<T>
) => void) & {
  flush: () => void;
  cancel: () => void;
};

export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delay: number
): DebouncedCallback<T> {
  const fnRef = useRef(fn);
  const timerRef = useRef<number | undefined>(undefined);
  const argsRef = useRef<Parameters<T> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const flush = useCallback(() => {
    if (timerRef.current === undefined) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    const args = argsRef.current;
    argsRef.current = null;
    if (args) {
      fnRef.current(...args);
    }
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    argsRef.current = null;
  }, []);

  const run = useCallback(
    (...args: Parameters<T>) => {
      argsRef.current = args;
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = undefined;
        const pending = argsRef.current;
        argsRef.current = null;
        if (pending) {
          fnRef.current(...pending);
        }
      }, delay);
    },
    [delay]
  ) as DebouncedCallback<T>;

  run.flush = flush;
  run.cancel = cancel;

  useEffect(() => {
    return () => {
      window.clearTimeout(timerRef.current);
    };
  }, []);

  return run;
}
