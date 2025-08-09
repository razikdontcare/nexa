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
  private static groupCache = new NodeCache({
    stdTTL: 5 * 60,
    useClones: false,
  });

  static async createInstance(
    options: WhatsAppConfigOptions
  ): Promise<WASocket> {
    const { sessionId, onConnected, onDisconnected, onMessage, onQRCode } =
      options;

    const { state: authState, saveCreds } = await useMongoDBAuthState(
      sessionId
    );

    const store = new MongoDBStore(sessionId);

    const sock = makeWASocket({
      logger: pinoLogger,
      auth: authState,
      syncFullHistory: false,
      browser: Browsers.macOS("Desktop"),
      markOnlineOnConnect: true,
      shouldIgnoreJid: (jid) => isJidBroadcast(jid),
      patchMessageBeforeSending: (message) => {
        if (message.buttonsMessage) {
          message.buttonsMessage.contentText =
            message.buttonsMessage.contentText || "No content";
        }
        return message;
      },
      getMessage: async (key) => {
        try {
          const message = await store.loadMessageByKey(key);
          if (message) {
            return (
              message.messageObject || {
                conversation: message.message || "Message",
              }
            );
          }
          logger.warn(`No message found for key: ${key}`);
          return undefined;
        } catch (error) {
          logger.error(`Failed to get message for key ${key}:`, error);
          return undefined;
        }
      },
      cachedGroupMetadata: async (jid) => {
        const cached = this.groupCache.get(jid) as GroupMetadata;
        if (cached) {
          return cached;
        }
        return undefined;
      },
    });

    store.bind(sock.ev);

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
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;
        logger.info(
          "Connection closed due to",
          lastDisconnect?.error,
          ", reconnecting",
          shouldReconnect
        );
        await Session.findOneAndUpdate(
          { sessionId },
          { status: "disconnected" }
        );

        if (onDisconnected) {
          onDisconnected(
            (lastDisconnect?.error as Boom) || DisconnectReason.connectionClosed
          );
        }

        if (shouldReconnect) {
          logger.info(`Reconnecting session ${sessionId} in 3 seconds...`);
          setTimeout(() => this.createInstance(options), 3000);
        } else {
          logger.warn(`Session ${sessionId} logged out, not reconnecting.`);
        }
      } else if (connection === "open") {
        logger.info(`Session ${sessionId} connected successfully.`);
        await Session.findOneAndUpdate(
          { sessionId },
          {
            status: "connected",
            lastConnected: new Date(),
            qrCode: null,
          }
        );
        if (onConnected) {
          onConnected();
        }
      }
    });

    sock.ev.on("messages.upsert", async (m) => {
      if (m.type === "notify") {
        for (const msg of m.messages) {
          if (!msg.key.fromMe && msg.message) {
            if (onMessage) {
              onMessage(msg);
            }
          }
        }
      }
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
    return this.instances.delete(sessionId);
  }

  static getAllInstances(): Map<
    string,
    { socket: WASocket; store: MongoDBStore }
  > {
    return this.instances;
  }
}
