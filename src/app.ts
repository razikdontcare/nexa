import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import { getDb } from "./infrastructure/db/mongo.js";
import { useMongoAuthState } from "./infrastructure/auth/mongo-auth-state.js";
import { logger } from "./utils/logger.js";
import { config } from "./config/index.js";
import { loadCommands } from "./application/commands/index.js";
import { getOrCreateBotConfig } from "./infrastructure/repositories/bot-config.repo.js";
import { setRuntimeConfig } from "./domain/bot/runtime-config.js";
import { createMessageHandler } from "./application/handlers/message-handler.js";
import {
  startWebServer,
  setConnectionStatus,
  setLatestQR,
  attachSocket,
} from "./web/server.js";
import { hub } from "./web/hub.js";
import * as metrics from "./domain/bot/metrics.js";
import {
  attachGroupCacheEvents,
  cachedGroupMetadataLookup,
  configureGroupCache,
} from "./infrastructure/wa/group-cache.js";

async function start() {
  await getDb();

  const { state, saveCreds } = await useMongoAuthState("baileys");

  // Initialize in-memory runtime config from DB
  try {
    const cfg = await getOrCreateBotConfig();
    setRuntimeConfig({ prefix: cfg.prefix, ownerJid: cfg.ownerJid || "" });
  } catch {}
  // quick sanity checks on revived buffers
  try {
    const nk = (state as any)?.creds?.noiseKey;
    const pub = nk?.public;
    const priv = nk?.private;
    logger.debug(
      {
        noiseKeyTypes: {
          public: pub ? pub.constructor?.name : null,
          private: priv ? priv.constructor?.name : null,
          isPubBuffer: Buffer.isBuffer(pub),
          isPrivBuffer: Buffer.isBuffer(priv),
        },
      },
      "noiseKey types"
    );
  } catch {}

  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info({ version, isLatest }, "Using Baileys version");
  metrics.setVersion(version.join("."));

  const sock = makeWASocket({
    version,
    logger: logger,
    // QR rendered via connection.update handler
    browser: Browsers.appropriate(config.waDeviceName),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger as any),
    },
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    // Provide cached group metadata to avoid network fetches on sendMessage
    cachedGroupMetadata: async (jid) => cachedGroupMetadataLookup(jid),
  });

  sock.ev.on("creds.update", saveCreds);
  attachSocket(sock);
  // Optional: allow tuning TTL via env
  try {
    const ttl = process.env.GROUP_CACHE_TTL_MS
      ? parseInt(process.env.GROUP_CACHE_TTL_MS)
      : undefined;
    configureGroupCache({ ttlMs: ttl && ttl > 0 ? ttl : undefined });
  } catch {}
  attachGroupCacheEvents(sock);

  // Wrap groupMetadata to prime our cache on network fetches
  try {
    const originalGroupMetadata = sock.groupMetadata.bind(sock);
    sock.groupMetadata = (async (jid: string) => {
      const meta = await originalGroupMetadata(jid);
      // Lazy import to avoid circulars
      const { cacheGroupMetadata } = await import(
        "./infrastructure/wa/group-cache.js"
      );
      cacheGroupMetadata(jid, meta as any);
      return meta;
    }) as any;
  } catch {}

  // Pairing code mode (optional alternative to QR)
  if (config.waPairingMode === "pair" && !sock.authState.creds.registered) {
    const phoneNumber = process.env.WA_PHONE_NUMBER;
    if (!phoneNumber) {
      logger.warn("WA_PAIRING_MODE=pair requires WA_PHONE_NUMBER to be set");
    } else {
      const code = await sock.requestPairingCode(phoneNumber);
      // Show spaced code for readability
      logger.info({ code: code.match(/.{1,4}/g)?.join(" ") }, "Pairing code");
    }
  }

  const commands = await loadCommands();
  await createMessageHandler(sock, commands);

  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr && config.waPairingMode === "qr") {
      // Always update web panel first
      setLatestQR(qr);
      hub.emit("qr", qr);
      // Optionally show in terminal if enabled
      if (config.showTerminalQR) {
        try {
          const term = await QRCode.toString(qr, { type: "terminal" });
          console.log(term);
        } catch (err) {
          logger.error({ err }, "Failed to render terminal QR");
        }
      }
    }
    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error as any)?.output?.statusCode !==
        DisconnectReason.loggedOut;
      logger.warn({ shouldReconnect }, "Connection closed");
      setConnectionStatus("close");
      metrics.setStatus("close");
      hub.emit("status", "close");
      hub.emit("metrics", metrics.snapshot());
      if (shouldReconnect)
        start().catch((err) => logger.error(err, "Reconnect failed"));
    } else if (connection === "open") {
      logger.info("WhatsApp connection opened");
      setConnectionStatus("open");
      metrics.setStatus("open");
      try {
        const me =
          (sock as any)?.authState?.creds?.me?.id || (sock as any)?.user?.id;
        if (me) metrics.setMe(me);
      } catch {}
      setLatestQR(null);
      hub.emit("status", "open");
      hub.emit("metrics", metrics.snapshot());
    } else if (connection === "connecting") {
      setConnectionStatus("connecting");
      metrics.setStatus("connecting");
      hub.emit("status", "connecting");
      hub.emit("metrics", metrics.snapshot());
    }
  });
}

start().catch((err) => {
  logger.error({ err }, "Fatal error starting bot");
  process.exit(1);
});

// Start Web server after bootstrapping Mongo (not blocking)
startWebServer().catch((err) => logger.error({ err }, "Web server failed"));
