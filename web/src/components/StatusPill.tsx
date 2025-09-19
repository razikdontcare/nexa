import type { Status } from "../types";

export function StatusPill({ status }: { status: Status }) {
  const bg =
    status === "open"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
      : status === "connecting"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
      : status === "close"
      ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
      : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-200";
  const dot =
    status === "open"
      ? "bg-emerald-500"
      : status === "connecting"
      ? "bg-amber-500 animate-pulse"
      : status === "close"
      ? "bg-rose-500"
      : "bg-neutral-400";
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium ${bg}`}>
      <span className={`inline-block size-2 rounded-full ${dot}`}></span>
      {status}
    </span>
  );
}
