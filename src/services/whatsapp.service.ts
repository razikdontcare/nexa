import { WASocket, jidNormalizedUser, proto } from "baileys";
import { WhatsAppConfig, WhatsAppConfigOptions } from "@/config/whatsapp";
import { Session } from "@/models/Session";
import { Message } from "@/models/Message";
import { User } from "@/models/User";
import { logger } from "@/utils/logger";
import { CommandHandler } from "./commandHandler.service";
import { configService } from "./config.service";
import { IMessage, ISession } from "@/types";
import { AuthCreds } from "@/models/AuthCreds";
import { SignalKey } from "@/models/SignalKey";

export class WhatsAppService {
  private static commandHandler: CommandHandler;

  static async initializeCommandHandler(): Promise<void> {
    if (!this.commandHandler) {
      if (!configService.isInitialized()) {
        logger.warn("ConfigService is not initialized in WhatsAppService.");
      }
      this.commandHandler = new CommandHandler();
      logger.info("CommandHandler initialized in WhatsAppService.");
    }
  }

  static async createSession(sessionId: string, name: string): Promise<void> {
    try {
      await Session.findOneAndUpdate(
        { sessionId },
        { sessionId, name, status: "connecting" },
        { upsert: true, new: true }
      );

      if (!this.commandHandler) {
        await this.initializeCommandHandler();
      }

      const options: WhatsAppConfigOptions = {
        sessionId,
        onQRCode: async (qr: string) => {
          await Session.findOneAndUpdate(
            { sessionId },
            { status: "qr_required", qrCode: qr }
          );
          logger.info(`QR Code generated for session ${sessionId}`);
        },
        onConnected: async () => {
          await Session.findOneAndUpdate(
            { sessionId },
            {
              status: "connected",
              lastConnected: new Date(),
              qrCode: null,
            }
          );
          logger.info(`Session ${sessionId} connected successfully.`);
        },
        onDisconnected: async (reason) => {
          await Session.findOneAndUpdate(
            { sessionId },
            {
              status: "disconnected",
            }
          );
          logger.info(`Session ${sessionId} disconnected:`, reason);
        },
        onMessage: async (msg) => {
          const sock = WhatsAppConfig.getInstance(sessionId);
          if (sock && this.commandHandler) {
            await this.commandHandler.processCommand(sock, msg, sessionId);
          } else {
            await this.handleIncomingMessage(sessionId, msg);
          }
        },
      };

      await WhatsAppConfig.createInstance(options);
    } catch (error) {
      logger.error(`Failed to create session ${sessionId}:`, error);
      await Session.findOneAndUpdate(
        { sessionId },
        { status: "disconnected" }
      ).catch((err) =>
        logger.error(`Failed to update session status for ${sessionId}:`, err)
      );
      throw error;
    }
  }

  static async getSession(sessionId: string): Promise<ISession | null> {
    return await Session.findOne({ sessionId });
  }

  static async getAllSessions(): Promise<ISession[]> {
    return await Session.find();
  }

  static async deleteSession(sessionId: string): Promise<void> {
    try {
      await Session.findOneAndDelete({ sessionId });
      logger.info(`Session ${sessionId} deleted successfully.`);

      const deleteAuthCredsResult = await AuthCreds.findOneAndDelete({
        sessionId,
      });
      if (deleteAuthCredsResult) {
        logger.info(`AuthCreds for session ${sessionId} deleted successfully.`);
      } else {
        logger.warn(`No AuthCreds found for session ${sessionId}.`);
      }

      const deleteSignalKeysResult = await SignalKey.deleteMany({ sessionId });
      logger.info(
        `Deleted ${deleteSignalKeysResult.deletedCount} SignalKeys for session ${sessionId}.`
      );

      const wasRemoved = WhatsAppConfig.removeInstance(sessionId);
      if (wasRemoved) {
        logger.info(
          `WhatsApp instance for session ${sessionId} removed successfully.`
        );
      } else {
        logger.warn(`No WhatsApp instance found for session ${sessionId}.`);
      }
    } catch (error) {
      logger.error(`Failed to delete session ${sessionId}:`, error);
      throw error;
    }
  }

  static async sendMessage(
    sessionId: string,
    to: string,
    message: string
  ): Promise<void> {
    const sock = WhatsAppConfig.getInstance(sessionId);
    if (!sock) {
      throw new Error(`Session ${sessionId} not found or not connected`);
    }

    try {
      await sock.sendMessage(to, { text: message });
      await Message.create({
        sessionId,
        from: sock.user?.id || "unknown",
        to,
        message,
        messageType: "text",
        status: "sent",
      });
      logger.info(`Message sent to ${to} from session ${sessionId}`);
    } catch (error) {
      logger.error("Error sending message:", error);
      throw error;
    }
  }

  static async getQRCode(sessionId: string): Promise<string | null> {
    const session = await Session.findOne({ sessionId });
    return session?.qrCode || null;
  }

  private static async handleIncomingMessage(
    sessionId: string,
    msg: proto.IWebMessageInfo
  ): Promise<void> {
    try {
      const fromJidRaw = msg.key.remoteJid || "";
      const fromJidNormalized = jidNormalizedUser(fromJidRaw);

      const messageContent =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "[Media Message]";

      const senderJidRaw = msg.key.participant || msg.key.remoteJid || "";
      const senderJidNormalized = jidNormalizedUser(senderJidRaw);

      await User.findOneAndUpdate(
        { jid: senderJidNormalized },
        {
          jid: senderJidNormalized,
          name: msg.pushName,
          lastSeen: new Date(),
        },
        { upsert: true, new: true }
      );

      await Message.create({
        sessionId,
        from: senderJidNormalized,
        to: msg.key.fromMe ? senderJidNormalized : fromJidNormalized,
        message: messageContent,
        messageType: "text",
        status: "received",
        timestamp: new Date((msg.messageTimestamp as number) * 1000),
        meta: {
          rawRemoteJid: fromJidRaw,
          rawParticipantJid: msg.key.participant,
        },
      });

      logger.info(
        `Received message from ${senderJidNormalized} in chat ${fromJidNormalized}: ${messageContent}`
      );
    } catch (error) {
      logger.error("Error handling incoming message:", error);
    }
  }

  static async getMessages(
    sessionId: string,
    limit: number = 50
  ): Promise<IMessage[]> {
    return await Message.find({ sessionId })
      .sort({ timestamp: -1 })
      .limit(limit);
  }

  static async reloadCommands(): Promise<void> {
    if (this.commandHandler) {
      await this.commandHandler.reloadCommands();
    }
  }

  static getCommandList(): any[] {
    if (this.commandHandler) {
      return this.commandHandler.getAllCommands().map((cmd) => ({
        name: cmd.name,
        aliases: cmd.aliases,
        description: cmd.description,
        category: cmd.category,
        cooldown: cmd.cooldown,
      }));
    }
    return [];
  }

  static getCommandsByCategory(): Map<string, string[]> {
    if (this.commandHandler) {
      return this.commandHandler.getCommandsByCategory();
    }
    return new Map();
  }

  static async getConfig(): Promise<any> {
    return await configService.getAll();
  }

  static async updateConfig(key: string, value: any): Promise<void> {
    await configService.set(key, value);
  }
}
