import { AuthenticationCreds, SignalDataTypeMap } from "baileys";
import { Document } from "mongoose";

export interface IUser extends Document {
  jid: string;
  phoneNumber?: string;
  name?: string;
  status: "active" | "inactive" | "blocked";
  lastSeen?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMessage extends Document {
  sessionId: string;
  from: string;
  to: string;
  message: string;
  messageType:
    | "text"
    | "image"
    | "video"
    | "document"
    | "audio"
    | "location"
    | "contact";
  status: "sent" | "delivered" | "read" | "failed" | "received";
  timestamp: Date;
  metadata?: {
    rawRemoteJid?: string;
    rawParticipantJid?: string | null;
  };
  createdAt: Date;
}

export interface ISession extends Document {
  sessionId: string;
  name: string;
  status: "connected" | "disconnected" | "connecting" | "qr_required";
  qrCode?: string;
  lastConnected?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAuthCreds extends Document {
  sessionId: string;
  creds: AuthenticationCreds;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISignalKey extends Document {
  sessionId: string;
  keyType: keyof SignalDataTypeMap;
  keyId: string;
  value: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface IChat extends Document {
  id: string;
  sessionId: string;
  conversationTimestamp?: number;
  unreadCount?: number;
  archive?: boolean;
  mute?: number;
  pin?: number;
  lastMessage?: {
    key: {
      remoteJid?: string;
      fromMe?: boolean;
      id?: string;
    };
    messageTimestamp?: number;
  };
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreContact extends Document {
  id: string;
  sessionId: string;
  name?: string;
  notify?: string;
  pictureUrl?: string;
  status?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBotConfig extends Document {
  key: string;
  value: any;
  description?: string;
  type: "string" | "number" | "boolean" | "object";
  category?: string;
  createdAt: Date;
  updatedAt: Date;
}
