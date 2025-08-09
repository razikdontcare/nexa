import mongoose, { Schema } from "mongoose";
import type { IChat } from "@/types";

const ChatSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  sessionId: { type: String, required: true, index: true },
  conversationTimestamp: { type: Number },
  unreadCount: { type: Number, default: 0 },
  archive: { type: Boolean, default: false },
  mute: { type: Number },
  pin: { type: Number },
  lastMessage: {
    key: {
      remoteJid: String,
      fromMe: Boolean,
      id: String,
    },
    messageTimestamp: Number,
  },
  name: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ChatSchema.index({ sessionId: 1, id: 1 }, { unique: true });

ChatSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const Chat = mongoose.model<IChat>("Chat", ChatSchema);
