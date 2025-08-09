import { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  WASocket,
  Browsers,
  isJidBroadcast,
  GroupMetadata,
} from "baileys";
import { logger, pinoLogger } from "@/utils/logger";
import { useMongoDBAuthState } from "@/services/mongodbAuthState";
import { Session } from "@/models/Session";
import { MongoDBStore } from "@/services/mongodbStore";
import NodeCache from "node-cache";
import { AuthCreds } from "@/models/AuthCreds";
import { SignalKey } from "@/models/SignalKey";

export interface WhatsAppConfigOptions {
  sessionId: string;
  onQRCode?: (qr: string) => void;
  onConnected?: () => void;
  onDisconnected?: (reason: DisconnectReason | Boom) => void;
  onMessage?: (message: any) => void;
}

export class WhatsAppConfig {
  private static instances: Map<
    string,
    { socket: WASocket; store: MongoDBStore }
  > = new Map();
  private static criticalAuthFailures: Set<string> = new Set();
  private static groupCache = new NodeCache({
    stdTTL: 5 * 60,
    useClones: false,
  });

  static async createInstance(
    options: WhatsAppConfigOptions
  ): Promise<WASocket> {
    const { sessionId, onConnected, onDisconnected, onMessage, onQRCode } =
      options;

    if (this.criticalAuthFailures.has(sessionId)) {
      logger.warn(
        `Session ${sessionId} had a critical auth failure previously. Cleaning up auth state before reconnecting.`
      );
      try {
        await AuthCreds.findOneAndDelete({ sessionId });
        await SignalKey.deleteMany({ sessionId });
        logger.info(
          `Cleaned up AuthCreds and SignalKeys for session ${sessionId} due to previous critical failure.`
        );
      } catch (cleanupError) {
        logger.error(
          `Error cleaning up auth state for session ${sessionId}:`,
          cleanupError
        );
      }
      this.criticalAuthFailures.delete(sessionId);
    }

    const { state: authState, saveCreds } = await useMongoDBAuthState(
      sessionId
    );

    const store = new MongoDBStore(sessionId);

    const sock = makeWASocket({
      logger: pinoLogger,
      auth: authState,
      syncFullHistory: false, // Disable to avoid Buffer serialization issues
      browser: Browsers.macOS("Desktop"),
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      shouldIgnoreJid: (jid) => isJidBroadcast(jid),
      patchMessageBeforeSending: (message, jids) => {
        return message;
      },
      getMessage: async (key) => {
        // Temporarily disable message retrieval to avoid Buffer serialization issues
        logger.debug(`getMessage called for key: ${JSON.stringify(key)}`);
        return undefined;
      },
      cachedGroupMetadata: async (jid) => {
        const cached = this.groupCache.get(jid) as GroupMetadata;
        if (cached) {
          return cached;
        }
        return undefined;
      },
    });

    // store.bind(sock.ev); // Temporarily disable store binding to avoid Buffer issues

    // Add a global event listener to catch all events
    sock.ev.process(async (events) => {
      logger.info(
        `WhatsApp events received for session ${sessionId}:`,
        Object.keys(events)
      );
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && onQRCode) {
        await Session.findOneAndUpdate(
          { sessionId },
          { status: "qr_required", qrCode: qr }
        );
        onQRCode(qr);
        logger.info(`QR Code for session ${sessionId} updated.`);
      }

      if (connection === "close") {
        const reason = (lastDisconnect?.error as Boom) || undefined;
        const reasonCode = reason?.output?.statusCode;
        const disconnectMessage = reason?.message || "Unknown reason";

        const isLoggedOut = reasonCode === DisconnectReason.loggedOut;
        const isRestartRequired =
          reasonCode === DisconnectReason.restartRequired ||
          disconnectMessage.includes("Stream Errored (restart required)");
        const isCriticalFailure =
          disconnectMessage.includes(
            "Cannot read properties of undefined (reading 'public')"
          ) ||
          disconnectMessage.includes(
            'The "data" argument must be of type string or an instance of Buffer'
          );

        logger.info(
          `Connection closed for session ${sessionId} due to: ${disconnectMessage}`,
          reason
        );

        // 1) Expected path after QR scan: restart required — do NOT wipe auth
        if (isRestartRequired) {
          logger.info(
            `Restart required for session ${sessionId} (expected after QR/handshake). Reconnecting...`
          );
          try {
            (sock as any).end?.();
          } catch {}
          try {
            (sock as any).ws?.close?.();
          } catch {}

          await Session.findOneAndUpdate(
            { sessionId },
            { status: "connecting", qrCode: null }
          );

          // optional callback
          if (onDisconnected) {
            onDisconnected(reason || DisconnectReason.connectionLost);
          }

          setTimeout(() => {
            this.createInstance(options).catch((e) =>
              logger.error(`Auto-recreate failed for session ${sessionId}:`, e)
            );
          }, 1000);
          return;
        }

        // 2) Real critical fault: wipe and restart cleanly
        if (isCriticalFailure) {
          logger.error(
            `Critical failure detected for session ${sessionId}. Wiping auth state and restarting.`
          );
          this.criticalAuthFailures.add(sessionId);

          try {
            (sock as any).end?.();
          } catch {}
          try {
            (sock as any).ws?.close?.();
          } catch {}

          try {
            await AuthCreds.findOneAndDelete({ sessionId });
            await SignalKey.deleteMany({ sessionId });
            logger.warn(
              `AuthCreds and SignalKeys wiped for session ${sessionId}.`
            );
          } catch (wipeErr) {
            logger.error(
              `Failed wiping auth state for session ${sessionId}:`,
              wipeErr
            );
          }

          await Session.findOneAndUpdate(
            { sessionId },
            { status: "connecting", qrCode: null }
          );

          if (onDisconnected) {
            onDisconnected(reason || DisconnectReason.connectionClosed);
          }

          this.criticalAuthFailures.delete(sessionId);

          setTimeout(() => {
            this.createInstance(options).catch((e) =>
              logger.error(`Auto-recreate failed for session ${sessionId}:`, e)
            );
          }, 2000);
          return;
        }

        // 3) Logged out: do not reconnect; wipe so next start shows a fresh QR
        if (isLoggedOut) {
          logger.warn(`Session ${sessionId} logged out.`);
          await Session.findOneAndUpdate(
            { sessionId },
            { status: "disconnected", qrCode: null }
          );
          try {
            await AuthCreds.findOneAndDelete({ sessionId });
            await SignalKey.deleteMany({ sessionId });
            logger.info(`Cleared auth for logged-out session ${sessionId}.`);
          } catch (e) {
            logger.error(`Failed clearing auth for ${sessionId}:`, e);
          }
          if (onDisconnected) {
            onDisconnected(reason || DisconnectReason.loggedOut);
          }
          return;
        }

        // 4) Other transient issues: standard delayed reconnect
        await Session.findOneAndUpdate(
          { sessionId },
          { status: "disconnected" }
        );
        if (onDisconnected) {
          onDisconnected(reason || DisconnectReason.connectionClosed);
        }

        try {
          const sessionExists = await Session.exists({ sessionId });
          if (sessionExists) {
            if (this.criticalAuthFailures.has(sessionId)) {
              logger.info(
                `Session ${sessionId} is marked for critical auth cleanup, skipping standard reconnect.`
              );
              return;
            }
            logger.info(
              `Scheduling reconnection for session ${sessionId} in 3 seconds...`
            );
            setTimeout(() => this.createInstance(options), 3000);
          } else {
            logger.info(`Session ${sessionId} was deleted, not reconnecting.`);
          }
        } catch (checkError) {
          logger.error(
            `Error checking session existence for ${sessionId} during reconnect:`,
            checkError
          );
        }
      } else if (connection === "open") {
        logger.info(`Session ${sessionId} connected successfully.`);
        this.criticalAuthFailures.delete(sessionId);
        await Session.findOneAndUpdate(
          { sessionId },
          { status: "connected", lastConnected: new Date(), qrCode: null }
        );

        // Request chat history sync for recent messages
        logger.info(
          `[DEBUG] Requesting message history sync for session ${sessionId}`
        );

        if (onConnected) onConnected();
      }
    });

    sock.ev.on("messages.upsert", async (m) => {
      logger.info(
        `[DEBUG] Messages upserted for session ${sessionId}, type: ${m.type}, count: ${m.messages.length}`
      );

      // Log all message details for debugging
      for (let i = 0; i < m.messages.length; i++) {
        const msg = m.messages[i];

        // Check if this is a stub message (system message)
        if (msg.messageStubType) {
          logger.info(
            `[DEBUG] Received stub message (system message) - Type: ${msg.messageStubType}, from ${msg.key.remoteJid}, fromMe: ${msg.key.fromMe}`
          );
          logger.info(`[DEBUG] Stub message details:`, {
            stubType: msg.messageStubType,
            stubParameters: msg.messageStubParameters,
            pushName: msg.pushName,
            key: msg.key,
          });
          continue; // Skip processing stub messages
        }

        // Log regular message details
        logger.info(`[DEBUG] Message ${i + 1}:`, {
          key: msg.key,
          messageTimestamp: msg.messageTimestamp,
          fromMe: msg.key.fromMe,
          participant: msg.key.participant,
          remoteJid: msg.key.remoteJid,
          hasMessage: !!msg.message,
          messageType: msg.message ? Object.keys(msg.message)[0] : "none",
          pushName: msg.pushName,
          isStub: !!msg.messageStubType,
        });

        // Log the actual message content if it exists
        if (msg.message) {
          logger.info(`[DEBUG] Message content:`, msg.message);
        }
      }

      if (m.type === "notify") {
        for (const msg of m.messages) {
          // Skip stub messages (system messages)
          if (msg.messageStubType) {
            logger.info(
              `[DEBUG] Skipping stub message type ${msg.messageStubType}`
            );
            continue;
          }

          logger.info(
            `[DEBUG] Processing message from ${msg.key.remoteJid}, fromMe: ${
              msg.key.fromMe
            }, hasMessage: ${!!msg.message}`
          );

          if (!msg.key.fromMe && msg.message) {
            logger.info(
              `[DEBUG] Calling onMessage handler for session ${sessionId}`
            );
            if (onMessage) {
              onMessage(msg);
            } else {
              logger.warn(
                `[DEBUG] No onMessage handler found for session ${sessionId}`
              );
            }
          } else {
            logger.debug(
              `[DEBUG] Skipping message - fromMe: ${
                msg.key.fromMe
              }, hasMessage: ${!!msg.message}, isStub: ${!!msg.messageStubType}`
            );
          }
        }
      } else {
        logger.info(
          `[DEBUG] Message type is '${m.type}' (not 'notify'), skipping processing`
        );
      }
    });

    // Add additional event listeners for debugging
    sock.ev.on("messages.update", (updates) => {
      logger.info(
        `[DEBUG] Messages updated for session ${sessionId}:`,
        updates.length
      );
    });

    sock.ev.on("message-receipt.update", (updates) => {
      logger.info(
        `[DEBUG] Message receipts updated for session ${sessionId}:`,
        updates.length
      );
    });

    sock.ev.on("presence.update", (update) => {
      logger.info(`[DEBUG] Presence update for session ${sessionId}:`, update);
    });

    sock.ev.on("chats.upsert", (chats) => {
      logger.info(
        `[DEBUG] Chats upserted for session ${sessionId}:`,
        chats.length
      );
    });

    // Add messaging history sync events
    sock.ev.on("messaging-history.set", (data) => {
      logger.info(`[DEBUG] Messaging history set for session ${sessionId}:`, {
        chats: data.chats?.length || 0,
        contacts: data.contacts?.length || 0,
        messages: data.messages?.length || 0,
        isLatest: data.isLatest,
      });
    });

    sock.ev.on("chats.delete", (deletions) => {
      logger.info(
        `[DEBUG] Chats deleted for session ${sessionId}:`,
        deletions.length
      );
    });

    sock.ev.on("labels.association", (associations) => {
      logger.info(
        `[DEBUG] Label associations for session ${sessionId}:`,
        associations
      );
    });

    sock.ev.on("creds.update", saveCreds);

    this.instances.set(sessionId, { socket: sock, store });
    return sock;
  }

  static getInstance(sessiondId: string): WASocket | undefined {
    return this.instances.get(sessiondId)?.socket;
  }

  static getStore(sessionId: string): MongoDBStore | undefined {
    return this.instances.get(sessionId)?.store;
  }

  static removeInstance(sessionId: string): boolean {
    const wasRemoved = this.instances.delete(sessionId);
    this.criticalAuthFailures.delete(sessionId);
    logger.debug(
      `Removed instance and cleared critical failure flag for session: ${sessionId}`
    );
    return wasRemoved;
  }

  static getAllInstances(): Map<
    string,
    { socket: WASocket; store: MongoDBStore }
  > {
    return this.instances;
  }
}
