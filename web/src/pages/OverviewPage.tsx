import { Card } from "../components/Card";
import { Skeleton } from "../components/Skeleton";
import type { Metrics, Status } from "../types";

function fmtBytes(n?: number) {
  if (!n && n !== 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let u = 0;
  let v = n;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(1)} ${units[u]}`;
}
function fmtUptime(ms?: number) {
  if (!ms && ms !== 0) return "-";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    ss = s % 60;
  return `${h}h ${m}m ${ss}s`;
}

export function OverviewPage({ status, mx }: { status: Status; mx: Metrics | null }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      <Card title="Runtime">
        {!mx ? (
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-neutral-500 dark:text-neutral-400">Uptime</div>
              <div className="font-medium text-neutral-900 dark:text-neutral-100">
                {fmtUptime(mx?.uptimeMs)}
              </div>
            </div>
            <div>
              <div className="text-neutral-500 dark:text-neutral-400">Status</div>
              <div className="font-medium text-neutral-900 dark:text-neutral-100">{status}</div>
            </div>
            <div>
              <div className="text-neutral-500 dark:text-neutral-400">Version</div>
              <div className="font-medium text-neutral-900 dark:text-neutral-100">{mx?.version || "-"}</div>
            </div>
            <div>
              <div className="text-neutral-500 dark:text-neutral-400">Me</div>
              <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate max-w-[220px]" title={mx?.me || ""}>
                {mx?.me || "-"}
              </div>
            </div>
            <div>
              <div className="text-neutral-500 dark:text-neutral-400">Heap</div>
              <div className="font-medium text-neutral-900 dark:text-neutral-100">
                {fmtBytes(mx?.memory?.heapUsed)} / {fmtBytes(mx?.memory?.heapTotal)}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card title="Activity">
        {!mx ? (
          <div className="grid grid-cols-4 gap-3 text-center">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Received</div>
              <div className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{mx?.counters?.recv ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Sent</div>
              <div className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{mx?.counters?.sent ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Commands</div>
              <div className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{mx?.counters?.cmds ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Cmd Errors</div>
              <div className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{mx?.counters?.cmdErrors ?? 0}</div>
            </div>
          </div>
        )}
      </Card>

      <Card title="Recent">
        <div className="mt-3 grid grid-cols-1 gap-2">
          {(mx?.recent || []).slice(0, 10).map((r, idx) => (
            <div key={idx} className="flex items-start justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full mt-1 ${
                    r.kind === "recv"
                      ? "bg-sky-500"
                      : r.kind === "send"
                      ? "bg-emerald-500"
                      : r.kind === "cmd"
                      ? "bg-indigo-500"
                      : r.kind === "error"
                      ? "bg-rose-500"
                      : "bg-neutral-400"
                  }`}
                ></span>
                <div className="text-neutral-800 dark:text-neutral-100">
                  <span className="uppercase text-[10px] tracking-wide text-neutral-500 dark:text-neutral-400">{r.kind}</span>
                  <span className="mx-2 text-neutral-500">•</span>
                  <span title={r.from || r.to || ""}>{r.summary}</span>
                </div>
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">{new Date(r.t).toLocaleTimeString()}</div>
            </div>
          ))}
          {(!mx?.recent || mx.recent.length === 0) && (
            <div className="text-sm text-neutral-500 dark:text-neutral-400">No activity yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
