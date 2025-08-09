import {
  BaileysEventEmitter,
  Contact,
  Chat,
  WAMessage,
  proto,
  jidNormalizedUser,
} from "baileys";
import { Chat as ChatModel } from "@/models/Chat";
import { StoreContact as ContactModel } from "@/models/StoreContact";
import { Message as MessageModel } from "@/models/Message";
import { logger } from "@/utils/logger";
import type { IChat, IStoreContact } from "@/types";

interface ExtendedChat extends Chat {
  lastMessage?: {
    key: {
      remoteJid: string;
      fromMe?: boolean;
      id?: string;
    };
    messageTimestamp?: number;
  };
}

export class MongoDBStore {
  private sessionId: string;
  public chats: { [id: string]: IChat } = {};
  public contacts: { [id: string]: IStoreContact } = {};

  constructor(sessionId: string) {
    if (!sessionId) {
      throw new Error("Session ID is required for MongoDBStore");
    }
    this.sessionId = sessionId;
    logger.info(`MongoDBStore initialized for session: ${sessionId}`);
  }

  bind(ev: BaileysEventEmitter): void {
    logger.info(
      `Binding MongoDBStore to events for session: ${this.sessionId}`
    );

    ev.on("chats.upsert", async (chats) => {
      await this.upsertChats(chats);
    });

    ev.on("chats.update", async (updates) => {
      await this.updateChats(updates);
    });

    ev.on("chats.delete", async (ids) => {
      await this.deleteChats(ids);
    });

    ev.on("contacts.upsert", async (contacts) => {
      await this.upsertContacts(contacts);
    });

    ev.on("contacts.update", async (updates) => {
      const validUpdates = updates.filter((u) => u.id);
      if (validUpdates.length > 0) {
        await this.updateContacts(validUpdates);
      }
    });

    ev.on("messages.upsert", async ({ messages }) => {
      await this.handleMessagesUpsert(messages);
    });

    ev.on("groups.upsert", async (groups) => {
      const groupChats: Partial<Chat>[] = groups.map((g) => ({
        id: g.id,
        name: g.subject,
      }));
      await this.upsertChats(groupChats as Chat[]);
    });

    ev.on("groups.update", async (updates) => {
      await this.updateChats(updates);
    });

    logger.info(`Bound MongoDBStore for session ${this.sessionId}`);
  }

  private async upsertChats(chats: Partial<Chat>[]) {
    try {
      const operations = chats.map((chat) => {
        const normalizedId = jidNormalizedUser(chat!.id);
        return {
          updateOne: {
            filter: { id: normalizedId, sessionId: this.sessionId },
            update: {
              $set: {
                ...chat,
                id: normalizedId,
                sessionId: this.sessionId,
                updatedAt: new Date(),
              },
            },
            upsert: true,
          },
        };
      });
      if (operations.length > 0) {
        await ChatModel.bulkWrite(operations, { ordered: false });
        logger.debug(
          `Upserted ${operations.length} chats for session ${this.sessionId}`
        );
      }
    } catch (error) {
      logger.error(
        `Error upserting chats for session ${this.sessionId}:`,
        error
      );
    }
  }

  private async updateChats(updates: Partial<Chat>[]) {
    try {
      const operations = updates
        .filter((update) => update.id)
        .map((update) => {
          const normalizedId = jidNormalizedUser(update.id!);
          const { id, ...updateData } = update;
          return {
            updateOne: {
              filter: { id: normalizedId, sessionId: this.sessionId },
              update: {
                $set: {
                  ...updateData,
                  updatedAt: new Date(),
                },
              },
            },
          };
        });
      if (operations.length > 0) {
        await ChatModel.bulkWrite(operations, { ordered: false });
        logger.debug(
          `Updated ${operations.length} chats for session ${this.sessionId}`
        );
      }
    } catch (error) {
      logger.error(
        `Error updating chats for session ${this.sessionId}:`,
        error
      );
    }
  }

  private async deleteChats(ids: string[]) {
    try {
      const normalizedIds = ids.map((id) => jidNormalizedUser(id));
      await ChatModel.deleteMany({
        id: { $in: normalizedIds },
        sessionId: this.sessionId,
      });
      normalizedIds.forEach((id) => delete this.chats[id]);
      logger.debug(
        `Deleted ${normalizedIds.length} chats for session ${this.sessionId}`
      );
    } catch (error) {
      logger.error(
        `Error deleting chats for session ${this.sessionId}:`,
        error
      );
    }
  }

  private async upsertContacts(contacts: Partial<Contact>[]) {
    try {
      const operations = contacts.map((contact) => {
        const normalizedId = jidNormalizedUser(contact.id!);
        return {
          updateOne: {
            filter: { id: normalizedId, sessionId: this.sessionId },
            update: {
              $set: {
                ...contact,
                id: normalizedId,
                sessionId: this.sessionId,
                updatedAt: new Date(),
              },
            },
            upsert: true,
          },
        };
      });

      if (operations.length > 0) {
        await ContactModel.bulkWrite(operations, { ordered: false });
        logger.debug(
          `Upserted ${operations.length} contacts for session ${this.sessionId}`
        );
      }
    } catch (error) {
      logger.error(
        `Error upserting contacts for session ${this.sessionId}:`,
        error
      );
    }
  }

  private async updateContacts(updates: Partial<Contact>[]) {
    try {
      const operations = updates
        .filter((update) => update.id)
        .map((update) => {
          const normalizedId = jidNormalizedUser(update.id!);
          const { id, ...updateData } = update;
          return {
            updateOne: {
              filter: { id: normalizedId, sessionId: this.sessionId },
              update: {
                $set: {
                  ...updateData,
                  updatedAt: new Date(),
                },
              },
            },
          };
        });

      if (operations.length > 0) {
        await ContactModel.bulkWrite(operations, { ordered: false });
        logger.debug(
          `Updated ${operations.length} contacts for session ${this.sessionId}`
        );
      }
    } catch (error) {
      logger.error(
        `Error updating contacts for session ${this.sessionId}:`,
        error
      );
    }
  }

  private async handleMessagesUpsert(messages: WAMessage[]) {
    try {
      const chatUpdates: Partial<ExtendedChat>[] = [];
      for (const msg of messages) {
        if (!msg.key?.remoteJid) continue;
        const jid = jidNormalizedUser(msg.key.remoteJid);
        const lastMessage = {
          key: {
            remoteJid: msg.key.remoteJid,
            fromMe: msg.key.fromMe ?? undefined,
            id: msg.key.id ?? undefined,
          },
          messageTimestamp: msg.messageTimestamp
            ? Number(msg.messageTimestamp)
            : undefined,
        };

        chatUpdates.push({
          id: jid,
          lastMessage,
        });
      }

      if (chatUpdates.length > 0) {
        await this.updateChats(chatUpdates);
      }

      const messageSaves = messages.map(async (msg) => {
        if (!msg.key?.remoteJid) return;

        const fromJidRaw = msg.key.remoteJid;
        const fromJidNormalized = jidNormalizedUser(fromJidRaw);
        const participantJidRaw = msg.key.participant;
        const participantJidNormalized = participantJidRaw
          ? jidNormalizedUser(participantJidRaw)
          : null;

        const messageContent =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          "[Media Message]";

        // Only save if there's actual message content
        if (msg.message && messageContent !== "[Media Message]") {
          await MessageModel.create({
            sessionId: this.sessionId,
            from: msg.key.fromMe
              ? "me"
              : participantJidNormalized || fromJidNormalized,
            to: msg.key.fromMe ? fromJidNormalized : "me",
            message: messageContent,
            messageType: "text",
            status: msg.key.fromMe ? "sent" : "received",
            timestamp: new Date((Number(msg.messageTimestamp) || 0) * 1000),
            meta: {
              rawRemoteJid: fromJidRaw,
              rawParticipantJid: participantJidRaw,
              // Don't store the full messageObject to avoid Buffer issues
            },
          });
        }
      });

      await Promise.all(messageSaves);
    } catch (error) {
      logger.error(
        `Error handling messages.upsert for session ${this.sessionId}:`,
        error
      );
    }
  }

  async loadChat(jid: string): Promise<IChat | null> {
    try {
      const normalizedJid = jidNormalizedUser(jid);
      const chat = await ChatModel.findOne({
        id: normalizedJid,
        sessionId: this.sessionId,
      });
      return chat;
    } catch (error) {
      logger.error(
        `Error loading chat ${jid} for session ${this.sessionId}:`,
        error
      );
      return null;
    }
  }

  async loadAllChats(): Promise<IChat[]> {
    try {
      const chats = await ChatModel.find({ sessionId: this.sessionId });
      return chats;
    } catch (error) {
      logger.error(
        `Error loading all chats for session ${this.sessionId}:`,
        error
      );
      return [];
    }
  }

  async loadContact(jid: string): Promise<IStoreContact | null> {
    try {
      const normalizedJid = jidNormalizedUser(jid);
      const contact = await ContactModel.findOne({
        id: normalizedJid,
        sessionId: this.sessionId,
      });
      return contact;
    } catch (error) {
      logger.error(
        `Error loading contact ${jid} for session ${this.sessionId}:`,
        error
      );
      return null;
    }
  }

  async loadAllContacts(): Promise<IStoreContact[]> {
    try {
      const contacts = await ContactModel.find({ sessionId: this.sessionId });
      return contacts;
    } catch (error) {
      logger.error(
        `Error loading all contacts for session ${this.sessionId}:`,
        error
      );
      return [];
    }
  }

  async loadMessages(jid: string, limit: number = 50): Promise<any[]> {
    try {
      const normalizedJid = jidNormalizedUser(jid);
      return await MessageModel.find({
        sessionId: this.sessionId,
        $or: [{ from: normalizedJid }, { to: normalizedJid }],
      })
        .sort({ timestamp: -1 })
        .limit(limit);
    } catch (error) {
      logger.error(
        `Error loading messages for chat ${jid} in session ${this.sessionId}:`,
        error
      );
      return [];
    }
  }

  async loadMessageByKey(key: proto.IMessageKey): Promise<any | null> {
    try {
      if (!key?.id || !key?.remoteJid) {
        return null;
      }

      const messageDoc = await MessageModel.findOne({
        sessionId: this.sessionId,
        "meta.messageObject.key.id": key.id,
        "meta.messageObject.key.remoteJid": key.remoteJid,
      });

      if (messageDoc && messageDoc.meta?.messageObject) {
        // Apply Buffer restoration to the message object before returning
        const restoredMessage = this.restoreBuffers(
          messageDoc.meta.messageObject
        );
        return {
          ...messageDoc.toObject(),
          meta: {
            ...messageDoc.meta,
            messageObject: restoredMessage,
          },
        };
      }

      return messageDoc;
    } catch (error) {
      logger.error(
        `Error loading message by key ${JSON.stringify(key)} for session ${
          this.sessionId
        }:`,
        error
      );
      return null;
    }
  }

  // Helper method to restore Buffer objects from MongoDB
  private restoreBuffers(obj: any): any {
    if (!obj || typeof obj !== "object") {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.restoreBuffers(item));
    }

    // Check if this is a Buffer-like object from MongoDB
    if (obj.type === "Buffer" && Array.isArray(obj.data)) {
      return Buffer.from(obj.data);
    }

    // Recursively process all object properties
    const restored: any = {};
    for (const [key, value] of Object.entries(obj)) {
      restored[key] = this.restoreBuffers(value);
    }
    return restored;
  }
}
