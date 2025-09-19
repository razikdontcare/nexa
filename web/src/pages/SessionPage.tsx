import { useCallback, useRef } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import type { Status } from "../types";

export function SessionPage({ status, showCanvas, onCanvasAvailable }: { status: Status; showCanvas: boolean; onCanvasAvailable?: (el: HTMLCanvasElement | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const downloadQR = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "whatsapp-qr.png";
    a.click();
  }, []);

  const clearQR = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const setCanvas = (el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    onCanvasAvailable?.(el);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      {status !== "open" ? (
        <Card title="Scan QR" actions={
          <div className="flex gap-2">
            <Button onClick={downloadQR}>Download</Button>
            <Button variant="outline" onClick={clearQR}>Clear</Button>
          </div>
        }>
          <div className="mt-4 flex items-center justify-center">
            <div className="rounded-2xl p-3 bg-white dark:bg-neutral-950 shadow-inner border border-neutral-200 dark:border-neutral-800">
              {showCanvas && (
                <canvas ref={setCanvas} width={320} height={320} className="[image-rendering:pixelated]" />
              )}
            </div>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-3">If not showing, ensure WA_PAIRING_MODE=qr and the bot is running.</p>
        </Card>
      ) : (
        <Card>Connected. Authentication UI is hidden.</Card>
      )}
    </div>
  );
}
