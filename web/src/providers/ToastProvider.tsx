import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Toast = { id: number; message: string; variant?: "default" | "success" | "error" | "warning" };

type ToastCtx = {
  toasts: Toast[];
  show: (message: string, variant?: Toast["variant"], ttlMs?: number) => void;
  dismiss: (id: number) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const show = useCallback((message: string, variant: Toast["variant"] = "default", ttlMs = 2500) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((ts) => [...ts, { id, message, variant }]);
    if (ttlMs > 0) setTimeout(() => dismiss(id), ttlMs);
  }, [dismiss]);

  const value = useMemo<ToastCtx>(() => ({ toasts, show, dismiss }), [toasts, show, dismiss]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed right-4 bottom-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={
              `rounded-lg px-4 py-3 shadow-xl ring-1 ring-black/5 text-sm ` +
              (t.variant === "success"
                ? "bg-emerald-600 text-white"
                : t.variant === "error"
                ? "bg-rose-600 text-white"
                : t.variant === "warning"
                ? "bg-amber-600 text-white"
                : "bg-neutral-900 text-white")
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

