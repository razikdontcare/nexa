import mongoose, { Schema } from 'mongoose';
import type { IMessage } from '@/types';

const MessageSchema = new Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  from: {
    type: String,
    required: true
  },
  to: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'video', 'document', 'audio', 'location', 'contact'],
    default: 'text'
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  meta: {
    type: Schema.Types.Mixed
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const Message = mongoose.model<IMessage>('Message', MessageSchema);