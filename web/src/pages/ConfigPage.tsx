import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { useToast } from "../providers/ToastProvider";
import { api, safeJSON } from "../lib/api";
import type { Status } from "../types";

export function ConfigPage({ status }: { status: Status }) {
  const { show } = useToast();
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<{ prefix: string; ownerJid: string }>({ prefix: "!", ownerJid: "" });
  const [pairPhone, setPairPhone] = useState("");
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [testingOwner, setTestingOwner] = useState(false);

  useEffect(() => {
    let ignore = false;
    api
      .getConfig()
      .then((c) => {
        if (ignore) return;
        setCfg({ prefix: c.prefix || "!", ownerJid: c.ownerJid || "" });
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const saveConfig = async () => {
    try {
      setSaving(true);
      const payload = {
        prefix: cfg.prefix.trim(),
        ownerJid: cfg.ownerJid.trim() || null,
      };
      await api.patchConfig(payload);
      show("Config saved", "success");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
      show("Failed to save: " + message, "error", 3000);
    } finally {
      setSaving(false);
    }
  };

  const requestPair = async () => {
    try {
      const phone = pairPhone.trim();
      if (!phone) {
        show("Enter phone number", "warning");
        return;
      }
      const res = await api.requestPair(phone);
      const groups = res.code.match(/.{1,4}/g);
      const spaced = groups ? groups.join(" ") : res.code;
      setPairCode(spaced);
      await navigator.clipboard?.writeText(res.code).catch(() => {});
      show("Pairing code copied", "success");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
      show("Pairing failed: " + message, "error", 3000);
    }
  };

  async function testOwnerMessage() {
    try {
      setTestingOwner(true);
      const res = await api.testOwner();
      if (res.ok) {
        const body = await safeJSON<{ toJid?: string }>(res);
        show("Test message sent to " + (body?.toJid || "owner"), "success");
      } else {
        const body = await safeJSON<{ error?: string }>(res);
        const msg =
          body?.error === "owner_not_set"
            ? "Owner JID not set"
            : body?.error === "socket_not_ready"
            ? "Bot socket not ready"
            : "Failed to send test message";
        show(msg, "error");
      }
    } finally {
      setTestingOwner(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      <Card title="Config">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Prefix</label>
            <input
              className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-neutral-900 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400/60"
              value={cfg.prefix}
              onChange={(e) => setCfg((c) => ({ ...c, prefix: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Owner JID</label>
            <input
              placeholder="1234567890@s.whatsapp.net or +1234567890"
              className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-neutral-900 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400/60"
              value={cfg.ownerJid}
              onChange={(e) => setCfg((c) => ({ ...c, ownerJid: e.target.value }))}
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">E.164 or full JID works. Example: +1234567890 or 1234567890@s.whatsapp.net</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={saveConfig} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Card>

      <Card title="Pairing (optional)">
        {status !== "open" ? (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Phone Number</label>
              <input
                placeholder="+1234567890"
                className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-neutral-900 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                value={pairPhone}
                onChange={(e) => setPairPhone(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={requestPair}>Request Pairing Code</Button>
              {pairCode && (
                <code className="rounded-md bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-800 dark:text-neutral-100">{pairCode}</code>
              )}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Pairing works when WA_PAIRING_MODE=pair.</p>
          </div>
        ) : (
          <div className="text-sm text-neutral-600 dark:text-neutral-300">Connected. Pairing not needed.</div>
        )}
      </Card>

      <Card title="Owner JID Tools">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">Send a test message to verify that the bot can reach the configured owner JID.</p>
        <div className="mt-3 flex items-center gap-2">
          <Button disabled={testingOwner} onClick={testOwnerMessage}>{testingOwner ? "Sending…" : "Send Test Message"}</Button>
        </div>
      </Card>
    </div>
  );
}
