import mongoose, { Schema } from 'mongoose';
import type { ISession } from '@/types';

const SessionSchema = new Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['connected', 'disconnected', 'connecting', 'qr_required'],
    default: 'disconnected'
  },
  qrCode: {
    type: String
  },
  lastConnected: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

SessionSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export const Session = mongoose.model<ISession>('Session', SessionSchema);