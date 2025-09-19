import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { api } from "./lib/api";
import { useEventSource } from "./hooks/useEventSource";
import { Layout } from "./Layout";
import { AuthPage } from "./pages/AuthPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ConfigPage } from "./pages/ConfigPage";
import { SessionPage } from "./pages/SessionPage";
import type { Metrics, Status } from "./types";

export default function App() {
  const [status, setStatus] = useState<Status>("unknown");
  const [sseOk, setSseOk] = useState(false);
  const [panelAuthed, setPanelAuthed] = useState<boolean>(false);
  const [panelRequireOtp, setPanelRequireOtp] = useState<boolean>(false);
  const [mx, setMx] = useState<Metrics | null>(null);
  const [tab, setTab] = useState<"overview" | "auth" | "config">("overview");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.status();
        setStatus((s.status || "unknown") as Status);
        const p = await api.panelStatus();
        setPanelAuthed(!!p.loggedIn);
        setPanelRequireOtp(!!p.requireOtp);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  const setCanvas = (el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
  };

  useEventSource(
    "/events",
    {
      status: (ev) => {
        try {
          const d = JSON.parse(ev.data);
          setStatus((d.status || "unknown") as Status);
        } catch (err) {
          console.error(err);
        }
      },
      qr: async (ev) => {
        try {
          const d = JSON.parse(ev.data);
          if (d.qr && canvasRef.current)
            await QRCode.toCanvas(canvasRef.current, d.qr, { width: 280 });
        } catch (err) {
          console.error(err);
        }
      },
      metrics: (ev) => {
        try {
          setMx(JSON.parse(ev.data));
        } catch (err) {
          console.error(err);
        }
      },
    },
    {
      enabled: panelAuthed,
      onOpen: () => setSseOk(true),
      onError: () => setSseOk(false),
    }
  );

  useEffect(() => {
    if (!panelAuthed) setSseOk(false);
  }, [panelAuthed]);

  if (!panelAuthed) {
    return (
      <div className="min-h-dvh bg-gradient-to-b from-sky-50 to-white dark:from-neutral-950 dark:to-neutral-950">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <AuthPage
            status={status}
            requireOtp={panelRequireOtp}
            onAuthed={() => setPanelAuthed(true)}
          />
        </div>
      </div>
    );
  }

  return (
    <Layout
      status={status}
      sseOk={sseOk}
      tab={tab}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTab={(t) => setTab(t as any)}
    >
      {tab === "overview" && <OverviewPage status={status} mx={mx} />}
      {tab === "auth" && (
        <SessionPage
          status={status}
          showCanvas={true}
          onCanvasAvailable={setCanvas}
        />
      )}
      {tab === "config" && <ConfigPage status={status} />}
    </Layout>
  );
}
