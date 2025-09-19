export type Status = "open" | "close" | "connecting" | "unknown";

export type Metrics = {
  startedAt: number;
  now: number;
  uptimeMs: number;
  status: Status;
  version?: string;
  me?: string;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  counters: { recv: number; sent: number; cmds: number; cmdErrors: number };
  recent: {
    t: number;
    kind: "recv" | "send" | "cmd" | "error" | "status";
    from?: string;
    to?: string;
    summary: string;
  }[];
};

