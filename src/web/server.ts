import express, {
  type Request as ExRequest,
  type Response as ExResponse,
} from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import url from "node:url";
import type { Response as ExResponse2 } from "express";
import { createHash } from "node:crypto";
import { hub } from "./hub.js";
import { logger } from "../utils/logger.js";
import { config } from "../config/index.js";
import {
  getOrCreateBotConfig,
  updateBotConfig,
} from "../infrastructure/repositories/bot-config.repo.js";
import { setRuntimeConfig } from "../domain/bot/runtime-config.js";
import {
  adminClearSessionsForJid,
  adminClearSenderKeys,
} from "../infrastructure/auth/mongo-auth-state.js";
import * as metrics from "../domain/bot/metrics.js";

let currentStatus: "open" | "close" | "connecting" | "unknown" = "unknown";
let latestQR: string | null = null;
let sockRef: any = null;

export function setConnectionStatus(status: typeof currentStatus) {
  currentStatus = status;
}

export function setLatestQR(qr: string | null) {
  latestQR = qr;
}

export function attachSocket(sock: any) {
  sockRef = sock;
}

function sseEvent(res: ExResponse, event: string, data: any) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function startWebServer() {
  const app = express();
  const dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const publicDir = path.resolve(dirname, "../../public");
  const webDistDir = process.env.WEB_DIST_DIR
    ? path.resolve(process.cwd(), process.env.WEB_DIST_DIR)
    : path.resolve(dirname, "../../web/dist");

  app.use(cors());
  app.use(express.json());
  // Prefer serving React build if available
  if (fs.existsSync(webDistDir)) {
    app.use(express.static(webDistDir));
  } else {
    app.use(express.static(publicDir));
  }

  app.get("/api/status", async (_req: ExRequest, res: ExResponse) => {
    res.json({ status: currentStatus, hasQR: !!latestQR });
  });
  // simple cookie-based session
  const SESS_COOKIE = "wp_session";
  type Sess = {
    authed: boolean
    otpHash?: string
    otpExpires?: number
    // rate limits
    otpLastSendAt?: number
    otpSendWindowStart?: number
    otpSendCount?: number
    otpVerifyFails?: number
    otpLockUntil?: number
  }
  const sessions = new Map<string, Sess>();
  const getSid = (req: ExRequest, res: ExResponse) => {
    const cookie = req.headers.cookie || "";
    const sid = cookie
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(SESS_COOKIE + "="))
      ?.split("=")[1];
    if (sid && sessions.has(sid)) return sid;
    const newSid =
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    sessions.set(newSid, { authed: false });
    res.setHeader(
      "Set-Cookie",
      `${SESS_COOKIE}=${newSid}; Path=/; HttpOnly; SameSite=Lax`
    );
    return newSid;
  };
  const getSession = (sid: string) => sessions.get(sid) || { authed: false } as Sess;
  const requireAuthed = (req: ExRequest, res: ExResponse, next: Function) => {
    const sid = getSid(req, res)
    const sess = getSession(sid)
    if (!sess.authed) return res.status(401).json({ error: 'unauthorized' })
    next()
  }

  app.get("/api/panel/status", async (req: ExRequest, res: ExResponse) => {
    const sid = getSid(req, res);
    const sess = getSession(sid);
    const ownerJid = (await getOrCreateBotConfig()).ownerJid || "";
    res.json({
      loggedIn: !!sess.authed,
      requireOtp: currentStatus === "open",
      status: currentStatus,
      ownerJidSet: !!ownerJid,
    });
  });

  app.post("/api/panel/login-up", async (req: ExRequest, res: ExResponse) => {
    const sid = getSid(req, res);
    const sess = getSession(sid);
    const { username, password } = (req.body || {}) as any;
    if (currentStatus === "open") {
      // when connected, do OTP flow; username/password not required per requirement
      return res.json({ ok: true, otpRequired: true });
    }
    if (username === config.panelUser && password === config.panelPass) {
      sess.authed = true;
      sessions.set(sid, sess);
      return res.json({ ok: true });
    }
    res.status(401).json({ error: "invalid_credentials" });
  });

  app.post("/api/panel/otp/send", async (req: ExRequest, res: ExResponse) => {
    try {
      const sid = getSid(req, res);
      const sess = getSession(sid);
      // rate limiting
      const now = Date.now()
      if (sess.otpLockUntil && now < sess.otpLockUntil) {
        return res.status(429).json({ error: 'locked' })
      }
      if (sess.otpLastSendAt && now - sess.otpLastSendAt < 30_000) {
        return res.status(429).json({ error: 'too_frequent' })
      }
      const windowStart = sess.otpSendWindowStart && (now - (sess.otpSendWindowStart)) < 60 * 60_000
        ? sess.otpSendWindowStart!
        : now
      const windowCount = (sess.otpSendWindowStart === windowStart ? (sess.otpSendCount || 0) : 0) + 1
      if (windowCount > 5) {
        return res.status(429).json({ error: 'rate_limited' })
      }
      const cfg = await getOrCreateBotConfig();
      const owner = cfg.ownerJid;
      if (!owner) return res.status(400).json({ error: "owner_not_set" });
      if (!sockRef) return res.status(503).json({ error: "socket_not_ready" });
      const normalizeJid = (v: string) => {
        const s = String(v).trim();
        if (s.includes("@")) return s;
        const digits = s.replace(/[^0-9]/g, "");
        if (!digits) return s;
        return `${digits}@s.whatsapp.net`;
      };
      const toJid = normalizeJid(owner);
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = createHash('sha256').update(otp + sid).digest('hex')
      sess.otpHash = otpHash;
      sess.otpExpires = now + 5 * 60 * 1000;
      sess.otpLastSendAt = now
      sess.otpSendWindowStart = windowStart
      sess.otpSendCount = windowCount
      sessions.set(sid, sess);
      logger.info({ toJid }, "Sending OTP to owner JID");
      await sockRef.sendMessage(toJid, {
        text: `Your Nexa Web OTP: ${otp}\nThis code expires in 5 minutes.`,
      });
      res.json({ ok: true });
    } catch (err: any) {
      logger.error({ err }, "Failed to send OTP");
      res.status(500).json({ error: "failed", details: err?.message });
    }
  });

  app.post("/api/panel/otp/verify", async (req: ExRequest, res: ExResponse) => {
    const sid = getSid(req, res);
    const sess = getSession(sid);
    const { code } = (req.body || {}) as any;
    const now = Date.now()
    if (sess.otpLockUntil && now < sess.otpLockUntil) return res.status(429).json({ error: 'locked' })
    if (!sess.otpHash || !sess.otpExpires)
      return res.status(400).json({ error: "no_otp" });
    if (now > sess.otpExpires)
      return res.status(400).json({ error: "expired" });
    const hash = createHash('sha256').update(String(code).trim() + getSid(req, res)).digest('hex')
    if (hash !== sess.otpHash) {
      sess.otpVerifyFails = (sess.otpVerifyFails || 0) + 1
      if (sess.otpVerifyFails >= 5) {
        sess.otpLockUntil = now + 10 * 60 * 1000 // 10 mins lock
      }
      sessions.set(getSid(req, res), sess)
      return res.status(400).json({ error: "invalid" });
    }
    sess.authed = true;
    sess.otpHash = undefined;
    sess.otpExpires = undefined;
    sess.otpVerifyFails = 0
    sess.otpLockUntil = undefined
    sessions.set(sid, sess);
    res.json({ ok: true });
  });
  app.get("/api/metrics", requireAuthed as any, async (_req: ExRequest, res: ExResponse) => {
    res.json(metrics.snapshot());
  });

  app.get("/api/config", requireAuthed as any, async (_req: ExRequest, res: ExResponse) => {
    const cfg = await getOrCreateBotConfig();
    res.json({ prefix: cfg.prefix, ownerJid: cfg.ownerJid || null });
  });

  app.patch("/api/config", requireAuthed as any, async (req: ExRequest, res: ExResponse) => {
    const { prefix, ownerJid } = req.body || {};
    const updated = await updateBotConfig({
      ...(typeof prefix === "string" ? { prefix } : {}),
      ...(typeof ownerJid === "string" ? { ownerJid } : {}),
    });
    // also update in-memory runtime config so changes apply immediately
    setRuntimeConfig({
      prefix: updated.prefix,
      ownerJid: updated.ownerJid || "",
    });
    res.json({ prefix: updated.prefix, ownerJid: updated.ownerJid || null });
  });

  // Admin endpoints to clear problematic keys when decrypt errors occur
  app.delete("/api/admin/session", async (req: ExRequest, res: ExResponse) => {
    const sid = getSid(req, res); const sess = getSession(sid); if (!sess.authed) return res.status(401).json({ error: 'unauthorized' })
    try {
      const jid = (req.query.jid || (req.body as any)?.jid) as
        | string
        | undefined;
      if (!jid) return res.status(400).json({ error: "jid is required" });
      const result = await adminClearSessionsForJid(jid);
      res.json(result);
    } catch (err: any) {
      logger.error({ err }, "Admin: clear session failed");
      res.status(500).json({ error: "failed", details: err?.message });
    }
  });

  app.delete(
    "/api/admin/sender-key",
    async (req: ExRequest, res: ExResponse) => {
      const sid = getSid(req, res); const sess = getSession(sid); if (!sess.authed) return res.status(401).json({ error: 'unauthorized' })
      try {
        const group = (req.query.group || (req.body as any)?.group) as
          | string
          | undefined;
        const author = (req.query.author || (req.body as any)?.author) as
          | string
          | undefined;
        if (!group) return res.status(400).json({ error: "group is required" });
        const result = await adminClearSenderKeys(group, author || undefined);
        res.json(result);
      } catch (err: any) {
        logger.error({ err }, "Admin: clear sender-key failed");
        res.status(500).json({ error: "failed", details: err?.message });
      }
    }
  );

  // Admin: send test message to owner
  app.post("/api/admin/test-owner", async (req: ExRequest, res: ExResponse) => {
    const sid = getSid(req, res); const sess = getSession(sid); if (!sess.authed) return res.status(401).json({ error: 'unauthorized' })
    try {
      if (!sockRef) return res.status(503).json({ error: 'socket_not_ready' })
      const cfg = await getOrCreateBotConfig();
      const owner = cfg.ownerJid
      if (!owner) return res.status(400).json({ error: 'owner_not_set' })
      const normalizeJid = (v: string) => {
        const s = String(v).trim();
        if (s.includes("@")) return s;
        const digits = s.replace(/[^0-9]/g, "");
        if (!digits) return s;
        return `${digits}@s.whatsapp.net`;
      };
      const toJid = normalizeJid(owner)
      await sockRef.sendMessage(toJid, { text: `Nexa Web test message: ${new Date().toLocaleString()}` })
      res.json({ ok: true, toJid })
    } catch (err: any) {
      logger.error({ err }, 'Admin: test-owner failed')
      res.status(500).json({ error: 'failed', details: err?.message })
    }
  })

  app.post("/api/pair", async (req: ExRequest, res: ExResponse) => {
    const sid = getSid(req, res); const sess = getSession(sid); if (!sess.authed) return res.status(401).json({ error: 'unauthorized' })
    try {
      if (!sockRef) return res.status(503).json({ error: "Socket not ready" });
      if (config.waPairingMode !== "pair")
        return res.status(400).json({ error: "Not in pairing mode" });
      const phone = (req.query.phone || req.body?.phone) as string | undefined;
      if (!phone) return res.status(400).json({ error: "phone is required" });
      const code = await sockRef.requestPairingCode(phone);
      res.json({ code });
    } catch (err: any) {
      logger.error({ err }, "Failed to generate pairing code");
      res.status(500).json({ error: "failed", details: err?.message });
    }
  });

  // Server-Sent Events for QR and status updates
  app.get("/events", (req: ExRequest, res: ExResponse) => {
    const sid = getSid(req, res); const sess = getSession(sid); if (!sess.authed) { res.status(401).end(); return }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const onQR = (qr: string) => sseEvent(res, "qr", { qr });
    const onStatus = (status: string) => sseEvent(res, "status", { status });
    const onMetrics = (data: any) => sseEvent(res, "metrics", data);

    hub.on("qr", onQR);
    hub.on("status", onStatus);
    hub.on("metrics", onMetrics);

    // send initial snapshot
    sseEvent(res, "status", { status: currentStatus });
    sseEvent(res, "metrics", metrics.snapshot());
    if (latestQR) sseEvent(res, "qr", { qr: latestQR });

    const keepAlive = setInterval(() => res.write(": ping\n\n"), 25000);

    req.on("close", () => {
      clearInterval(keepAlive);
      hub.off("qr", onQR);
      hub.off("status", onStatus);
      hub.off("metrics", onMetrics);
      res.end();
    });
  });

  // periodic metrics updates (uptime/memory)
  setInterval(() => hub.emit("metrics", metrics.snapshot()), 5000);

  app.listen(config.webPort, () => {
    logger.info({ port: config.webPort }, "Web panel listening");
  });
}
