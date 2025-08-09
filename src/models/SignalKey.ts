import mongoose, { Schema} from "mongoose";
import type { ISignalKey } from "@/types";

const SignalKeySchema = new Schema({
  sessionId: { type: String, required: true, index: true },
  keyType: { type: String, required: true, index: true },
  keyId: { type: String, required: true, index: true },
  value: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

SignalKeySchema.index({ sessionId: 1, keyType: 1, keyId: 1 }, { unique: true });

SignalKeySchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export const SignalKey = mongoose.model<ISignalKey>('SignalKey', SignalKeySchema);