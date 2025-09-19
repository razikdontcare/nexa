import type { Status } from "./types";
import { StatusPill } from "./components/StatusPill";
import { ThemeToggle } from "./components/ThemeToggle";
import { NavTabs } from "./components/NavTabs";
import { useEffect } from "react";
import { useTheme } from "./providers/ThemeProvider";

export function Layout({
  status,
  sseOk,
  tab,
  setTab,
  children,
}: {
  status: Status;
  sseOk: boolean;
  tab: string;
  setTab: (t: string) => void;
  children: React.ReactNode;
}) {
  const { toggle } = useTheme();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "1") setTab("overview");
      else if (e.key === "2") setTab("auth");
      else if (e.key === "3") setTab("config");
      else if (e.key.toLowerCase() === "t") toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTab, toggle]);
  return (
    <div className="min-h-dvh bg-gradient-to-b from-sky-50 to-white dark:from-neutral-950 dark:to-neutral-950">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">Nexa Bot Panel</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Manage your WhatsApp session</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill status={status} />
            <span className={`text-xs px-2 py-1 rounded-md ${sseOk ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"}`}>
              SSE {sseOk ? "connected" : "connecting..."}
            </span>
            <ThemeToggle />
          </div>
        </header>
        <NavTabs
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "auth", label: "Auth", badge: status !== "open" ? "needs action" : undefined },
            { id: "config", label: "Config" },
          ]}
          active={tab}
          onChange={setTab}
        />
        {children}
      </div>
    </div>
  );
}
