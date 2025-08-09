import mongoose, { Schema } from "mongoose";
import type { IBotConfig } from "@/types";

const BotConfigSchema = new Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: Schema.Types.Mixed, required: true },
  description: { type: String },
  type: {
    type: String,
    enum: ["string", "number", "boolean", "object"],
    required: true,
  },
  category: { type: String, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

BotConfigSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

BotConfigSchema.index({ key: 1 }, { unique: true });

export const BotConfig = mongoose.model<IBotConfig>(
  "BotConfig",
  BotConfigSchema
);
