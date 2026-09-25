"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

interface FetchState<T> {
  data: T | null;
  error: string | null;
  /** The request key this state answers. */
  settled: string;
}

/**
 * Loads data when `key` changes (put every input of the request into the key). Stale data
 * stays visible while a new request is in flight (`loading`), `reload()` refetches.
 */
export function useFetch<T>(key: string, fetcher: () => Promise<T>) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<FetchState<T>>({ data: null, error: null, settled: "" });
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const requestKey = `${key}#${nonce}`;
  useEffect(() => {
    let cancelled = false;
    fetcherRef.current().then(
      (data) => {
        if (!cancelled) setState({ data, error: null, settled: requestKey });
      },
      (e: unknown) => {
        if (cancelled) return;
        const message = e instanceof ApiError || e instanceof Error ? e.message : "Xatolik yuz berdi.";
        setState((prev) => ({ data: prev.data, error: message, settled: requestKey }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return {
    data: state.data,
    error: state.settled === requestKey ? state.error : null,
    loading: state.settled !== requestKey,
    reload,
  };
}

/** Debounced copy of a value (for search inputs). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Warns before losing unsaved work: browser reload/close (beforeunload) and clicks on
 * in-app links. Browser Back is not intercepted.
 */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const message = "Saqlanmagan o'zgarishlar bor. Sahifadan chiqsangiz, ular yo'qoladi.";
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.origin !== window.location.origin) return;
      if (anchor.pathname === window.location.pathname && anchor.search === window.location.search) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}
