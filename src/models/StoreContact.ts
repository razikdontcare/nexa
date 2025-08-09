import mongoose, { Schema } from "mongoose";
import type { IStoreContact } from "@/types";

const StoreContactSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  sessionId: { type: String, required: true, index: true },
  name: { type: String },
  notify: { type: String },
  pictureUrl: { type: String },
  status: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

StoreContactSchema.index({ sessionId: 1, id: 1 }, { unique: true });

StoreContactSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const StoreContact = mongoose.model<IStoreContact>(
  "StoreContact",
  StoreContactSchema
);
