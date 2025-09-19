import { useEffect, useRef, useState } from "react";

export function useEventSource(url: string, listeners: Record<string, (ev: MessageEvent) => void>, options?: { enabled?: boolean; onOpen?: () => void; onError?: (e: Event) => void }) {
  const { enabled = true, onOpen, onError } = options || {};
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource(url);
    esRef.current = es;
    es.onopen = () => {
      setConnected(true);
      onOpen?.();
    };
    es.onerror = (e) => {
      setConnected(false);
      onError?.(e);
    };
    for (const [k, fn] of Object.entries(listeners)) es.addEventListener(k, fn);
    return () => {
      for (const [k, fn] of Object.entries(listeners)) es.removeEventListener(k, fn);
      es.close();
    };
  }, [url, enabled]);

  return { connected };
}

