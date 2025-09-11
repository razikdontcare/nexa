import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

type Status = "open" | "close" | "connecting" | "unknown";
type Metrics = {
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

async function fetchJSON<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function useSSE(
  onQR: (qr: string) => void,
  onStatus: (s: Status) => void,
  onOpen?: () => void,
  onError?: (e: Event) => void
) {
  useEffect(() => {
    const es = new EventSource("/events");
    es.onopen = () => onOpen?.();
    es.onerror = (e) => onError?.(e);
    const onStatusEv = (ev: MessageEvent) => {
      try {
        const d = JSON.parse(ev.data);
        onStatus((d.status || "unknown") as Status);
      } catch {
        console.log("Invalid status event");
      }
    };
    const onQREv = (ev: MessageEvent) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.qr) onQR(d.qr);
      } catch {
        console.log("Invalid QR event");
      }
    };
    es.addEventListener("status", onStatusEv);
    es.addEventListener("qr", onQREv);
    return () => {
      es.removeEventListener("status", onStatusEv);
      es.removeEventListener("qr", onQREv);
      es.close();
    };
  }, [onQR, onStatus, onOpen, onError]);
}

export default function App() {
  const [status, setStatus] = useState<Status>("unknown");
  const [sseOk, setSseOk] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [panelAuthed, setPanelAuthed] = useState<boolean>(false);
  const [panelRequireOtp, setPanelRequireOtp] = useState<boolean>(false);
  const [cfg, setCfg] = useState<{ prefix: string; ownerJid: string }>({
    prefix: "!",
    ownerJid: "",
  });
  const [saving, setSaving] = useState(false);
  const [pairPhone, setPairPhone] = useState("");
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return (
      localStorage.getItem("theme") === "dark" ||
      (!localStorage.getItem("theme") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    );
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mx, setMx] = useState<Metrics | null>(null);
  const [tab, setTab] = useState<"overview" | "auth" | "config">("overview");
  const [sendingOtp, setSendingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  const [testingOwner, setTestingOwner] = useState(false)

  async function safeJSON<T>(res: Response): Promise<T | undefined> {
    try { return (await res.json()) as T } catch { return undefined }
  }

  useEffect(() => {
    (async () => {
      try {
        const s = await fetchJSON<{ status: Status; hasQR: boolean }>(
          "/api/status"
        );
        setStatus(s.status || "unknown");
        const p = await fetchJSON<{ loggedIn: boolean; requireOtp: boolean }>(
          "/api/panel/status"
        );
        setPanelAuthed(!!p.loggedIn);
        setPanelRequireOtp(!!p.requireOtp);
      } catch {
        console.log("Failed to fetch status");
      }
      try {
        const c = await fetchJSON<{ prefix: string; ownerJid: string }>(
          "/api/config"
        );
        setCfg({ prefix: c.prefix || "!", ownerJid: c.ownerJid || "" });
      } catch {
        console.log("Failed to fetch config");
      }
    })();
  }, []);

  useSSE(
    async (qr) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      await QRCode.toCanvas(canvas, qr, { width: 280 });
    },
    (s) => setStatus(s),
    () => setSseOk(true),
    () => setSseOk(false)
  );

  // metrics SSE
  useEffect(() => {
    const es = new EventSource("/events");
    const onMx = (ev: MessageEvent) => {
      try {
        setMx(JSON.parse(ev.data));
      } catch {
        console.log("Invalid metrics event");
      }
    };
    es.addEventListener("metrics", onMx);
    return () => {
      es.removeEventListener("metrics", onMx);
      es.close();
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const statusStyles = useMemo(() => {
    switch (status) {
      case "open":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
      case "connecting":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
      case "close":
        return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200";
      default:
        return "bg-neutral-100 text-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-200";
    }
  }, [status]);

  const downloadQR = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "whatsapp-qr.png";
    a.click();
  }, []);

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

  // Panel auth Handlers
  async function loginWithPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const username = String(form.get("username") || "");
    const password = String(form.get("password") || "");
    const res = await fetch("/api/panel/login-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      setPanelAuthed(true);
    } else {
      setToast("Invalid credentials");
      setTimeout(() => setToast(null), 2500);
    }
  }

  async function sendOtp() {
    try {
      setSendingOtp(true)
      const res = await fetch('/api/panel/otp/send', { method: 'POST' })
      if (res.ok) {
        setToast('OTP sent to owner JID')
      } else {
        const body = await safeJSON<{ error?: string }>(res)
        const msg = body?.error === 'owner_not_set' ? 'Owner JID not set in Config'
          : body?.error === 'socket_not_ready' ? 'Bot socket not ready'
          : body?.error === 'too_frequent' ? 'Please wait before requesting another OTP'
          : body?.error === 'rate_limited' ? 'Too many OTP requests; try again later'
          : body?.error === 'locked' ? 'Too many failures; OTP temporarily locked'
          : 'Failed to send OTP'
        setToast(msg)
      }
    } finally {
      setTimeout(() => setToast(null), 2500)
      setSendingOtp(false)
    }
  }

  async function verifyOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const code = String(form.get("code") || "");
    setVerifyingOtp(true)
    try {
      const res = await fetch('/api/panel/otp/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
      if (res.ok) {
        setPanelAuthed(true)
      } else {
        const body = await safeJSON<{ error?: string }>(res)
        const msg = body?.error === 'expired' ? 'OTP expired; request a new one'
          : body?.error === 'invalid' ? 'Invalid OTP; try again'
          : body?.error === 'locked' ? 'Too many attempts; temporarily locked'
          : 'OTP verification failed'
        setToast(msg)
        setTimeout(() => setToast(null), 2500)
      }
    } finally {
      setVerifyingOtp(false)
    }
  }

  async function testOwnerMessage() {
    try {
      setTestingOwner(true)
      const res = await fetch('/api/admin/test-owner', { method: 'POST' })
      if (res.ok) {
        const body = await safeJSON<{ toJid?: string }>(res)
        setToast('Test message sent to ' + (body?.toJid || 'owner'))
      } else {
        const body = await safeJSON<{ error?: string }>(res)
        const msg = body?.error === 'owner_not_set' ? 'Owner JID not set'
          : body?.error === 'socket_not_ready' ? 'Bot socket not ready'
          : 'Failed to send test message'
        setToast(msg)
      }
    } finally {
      setTimeout(()=>setToast(null), 2500)
      setTestingOwner(false)
    }
  }

  const clearQR = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const saveConfig = async () => {
    try {
      setSaving(true);
      const payload = {
        prefix: cfg.prefix.trim(),
        ownerJid: cfg.ownerJid.trim() || null,
      };
      await fetchJSON("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setToast("Config saved");
      setTimeout(() => setToast(null), 2000);
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "string"
          ? e
          : "Unknown error";
      setToast("Failed to save: " + message);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const requestPair = async () => {
    try {
      const phone = pairPhone.trim();
      if (!phone) {
        setToast("Enter phone number");
        setTimeout(() => setToast(null), 2000);
        return;
      }
      const res = await fetchJSON<{ code: string }>(
        `/api/pair?phone=${encodeURIComponent(phone)}`,
        { method: "POST" }
      );
      const groups = res.code.match(/.{1,4}/g);
      const spaced = groups ? groups.join(" ") : res.code;
      setPairCode(spaced);
      await navigator.clipboard?.writeText(res.code).catch(() => {});
      setToast("Pairing code copied");
      setTimeout(() => setToast(null), 2000);
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "string"
          ? e
          : "Unknown error";
      setToast("Pairing failed: " + message);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-sky-50 to-white dark:from-neutral-950 dark:to-neutral-950">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {!panelAuthed && (
          <div className="max-w-md mx-auto mt-10 border border-white/20 dark:border-white/10 bg-white/80 dark:bg-neutral-900/60 backdrop-blur rounded-xl p-6 shadow ring-1 ring-black/5">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {panelRequireOtp ? "Enter OTP" : "Sign in"}
            </h2>
            {!panelRequireOtp ? (
              <form className="mt-4 space-y-3" onSubmit={loginWithPassword}>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Username
                  </label>
                  <input
                    name="username"
                    className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Password
                  </label>
                  <input
                    type="password"
                    name="password"
                    className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500"
                  />
                </div>
                <button className="w-full mt-2 px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900">
                  Sign in
                </button>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Bot is {status}. Username/password works when bot is logged
                  out.
                </p>
              </form>
            ) : (
              <div className="mt-4">
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  We sent a one-time code to the Owner JID on WhatsApp. Enter it
                  below.
                </p>
                <form className="mt-3 flex gap-2" onSubmit={verifyOtp}>
                  <input
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="6-digit code"
                    className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500"
                  />
                  <button disabled={verifyingOtp} className="px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900">
                    {verifyingOtp ? 'Verifying…' : 'Verify'}
                  </button>
                </form>
                <button
                  onClick={sendOtp}
                  disabled={sendingOtp}
                  className="mt-3 text-sm px-3 py-1.5 rounded-md border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  {sendingOtp ? 'Sending…' : 'Resend OTP'}
                </button>
              </div>
            )}
          </div>
        )}
        {panelAuthed && (
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
                Nexa Bot Panel
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Manage your WhatsApp session
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium ${statusStyles}`}
              >
                <span
                  className={`inline-block size-2 rounded-full ${
                    status === "open"
                      ? "bg-emerald-500"
                      : status === "connecting"
                      ? "bg-amber-500 animate-pulse"
                      : status === "close"
                      ? "bg-rose-500"
                      : "bg-neutral-400"
                  }`}
                ></span>
                {status}
              </span>
              <span
                className={`text-xs px-2 py-1 rounded-md ${
                  sseOk
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                }`}
              >
                SSE {sseOk ? "connected" : "connecting..."}
              </span>
              <button
                onClick={() => setDark((v) => !v)}
                className="inline-flex items-center gap-2 rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                title="Toggle theme"
              >
                {dark ? "🌙 Dark" : "🌤️ Light"}
              </button>
            </div>
          </header>
        )}
        {panelAuthed && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setTab("overview")}
              className={`px-3 py-1.5 rounded-md text-sm ${
                tab === "overview"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setTab("auth")}
              className={`px-3 py-1.5 rounded-md text-sm ${
                tab === "auth"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              }`}
            >
              Auth{" "}
              {status !== "open" && (
                <span className="ml-1 text-xs px-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                  needs action
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("config")}
              className={`px-3 py-1.5 rounded-md text-sm ${
                tab === "config"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              }`}
            >
              Config
            </button>
          </div>
        )}

        {/* Metrics */}
        {panelAuthed && tab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <section className="border border-white/20 dark:border-white/10 bg-white/70 dark:bg-neutral-900/60 backdrop-blur rounded-xl p-5 shadow-lg ring-1 ring-black/5">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Runtime
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-neutral-500 dark:text-neutral-400">
                    Uptime
                  </div>
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">
                    {fmtUptime(mx?.uptimeMs)}
                  </div>
                </div>
                <div>
                  <div className="text-neutral-500 dark:text-neutral-400">
                    Version
                  </div>
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">
                    {mx?.version || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-neutral-500 dark:text-neutral-400">
                    Me
                  </div>
                  <div
                    className="font-medium text-neutral-900 dark:text-neutral-100 truncate max-w-[220px]"
                    title={mx?.me || ""}
                  >
                    {mx?.me || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-neutral-500 dark:text-neutral-400">
                    Heap
                  </div>
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">
                    {fmtBytes(mx?.memory?.heapUsed)} /{" "}
                    {fmtBytes(mx?.memory?.heapTotal)}
                  </div>
                </div>
              </div>
            </section>

            <section className="border border-white/20 dark:border-white/10 bg-white/70 dark:bg-neutral-900/60 backdrop-blur rounded-xl p-5 shadow-lg ring-1 ring-black/5">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Activity
              </h3>
              <div className="mt-3 grid grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Received
                  </div>
                  <div className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                    {mx?.counters?.recv ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Sent
                  </div>
                  <div className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                    {mx?.counters?.sent ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Commands
                  </div>
                  <div className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                    {mx?.counters?.cmds ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Cmd Errors
                  </div>
                  <div className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                    {mx?.counters?.cmdErrors ?? 0}
                  </div>
                </div>
              </div>
          </section>
          <section className="border border-white/20 dark:border-white/10 bg-white/70 dark:bg-neutral-900/60 backdrop-blur rounded-xl p-5 shadow-lg ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">Owner JID Tools</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">Send a test message to verify that the bot can reach the configured owner JID.</p>
            <div className="mt-3 flex items-center gap-2">
              <button disabled={testingOwner} onClick={testOwnerMessage} className="px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900">{testingOwner ? 'Sending…' : 'Send Test Message'}</button>
            </div>
          </section>
          </div>
        )}

        {panelAuthed && tab === "auth" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {status !== "open" ? (
              <section className="border border-white/20 dark:border-white/10 bg-white/70 dark:bg-neutral-900/60 backdrop-blur rounded-xl p-5 shadow-lg ring-1 ring-black/5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                    Scan QR
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={downloadQR}
                      className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                    >
                      Download
                    </button>
                    <button
                      onClick={clearQR}
                      className="px-3 py-1.5 text-sm rounded-md border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-center">
                  <div className="rounded-2xl p-3 bg-white dark:bg-neutral-950 shadow-inner border border-neutral-200 dark:border-neutral-800">
                    <canvas
                      ref={canvasRef}
                      width={320}
                      height={320}
                      className="[image-rendering:pixelated]"
                    />
                  </div>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-3">
                  If not showing, ensure WA_PAIRING_MODE=qr and the bot is
                  running.
                </p>
              </section>
            ) : (
              <section className="border border-white/20 dark:border-white/10 bg-white/70 dark:bg-neutral-900/60 backdrop-blur rounded-xl p-5 shadow-lg ring-1 ring-black/5 text-sm text-neutral-600 dark:text-neutral-300">
                Connected. Authentication UI is hidden.
              </section>
            )}
          </div>
        )}

        {panelAuthed && tab === "config" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <section className="border border-white/20 dark:border-white/10 bg-white/70 dark:bg-neutral-900/60 backdrop-blur rounded-xl p-5 shadow-lg ring-1 ring-black/5">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Config
              </h3>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Prefix
                  </label>
                  <input
                    className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-neutral-900 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                    value={cfg.prefix}
                    onChange={(e) =>
                      setCfg((v) => ({ ...v, prefix: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Owner JID
                  </label>
                  <input
                    placeholder="12345@s.whatsapp.net"
                    className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-neutral-900 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                    value={cfg.ownerJid}
                    onChange={(e) =>
                      setCfg((v) => ({ ...v, ownerJid: e.target.value }))
                    }
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveConfig}
                    disabled={saving}
                    className="px-4 py-2 rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </section>
            <section className="border border-white/20 dark:border-white/10 bg-white/70 dark:bg-neutral-900/60 backdrop-blur rounded-xl p-5 shadow-lg ring-1 ring-black/5">
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Pairing (optional)
              </h3>
              {status !== "open" ? (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Phone Number
                    </label>
                    <input
                      placeholder="+1234567890"
                      className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-neutral-900 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                      value={pairPhone}
                      onChange={(e) => setPairPhone(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={requestPair}
                      className="px-4 py-2 rounded-md border border-neutral-300 text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
                    >
                      Request Pairing Code
                    </button>
                    {pairCode && (
                      <code className="rounded-md bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-800 dark:text-neutral-100">
                        {pairCode}
                      </code>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Pairing works when WA_PAIRING_MODE=pair.
                  </p>
                </div>
              ) : (
                <div className="text-sm text-neutral-600 dark:text-neutral-300">
                  Connected. Pairing not needed.
                </div>
              )}
            </section>
          </div>
        )}

        {/* Recent activity */}
        {panelAuthed && tab === "overview" && (
          <section className="mt-6 border border-white/20 dark:border-white/10 bg-white/70 dark:bg-neutral-900/60 backdrop-blur rounded-xl p-5 shadow-lg ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Recent
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {(mx?.recent || []).slice(0, 10).map((r, idx) => (
                <div
                  key={idx}
                  className="flex items-start justify-between text-sm"
                >
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
                      <span className="uppercase text-[10px] tracking-wide text-neutral-500 dark:text-neutral-400">
                        {r.kind}
                      </span>
                      <span className="mx-2 text-neutral-500">•</span>
                      <span title={r.from || r.to || ""}>{r.summary}</span>
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {new Date(r.t).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              {(!mx?.recent || mx.recent.length === 0) && (
                <div className="text-sm text-neutral-500 dark:text-neutral-400">
                  No activity yet.
                </div>
              )}
            </div>
          </section>
        )}

        {toast && (
          <div className="fixed right-4 bottom-4 z-50">
            <div className="rounded-lg bg-neutral-900 text-white px-4 py-3 shadow-xl ring-1 ring-black/5">
              {toast}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
