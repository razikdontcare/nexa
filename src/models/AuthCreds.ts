import mongoose, { Schema } from "mongoose";
import type { IAuthCreds } from "@/types";

const AuthCredsSchema = new Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  creds: { type: Schema.Types.Map, of: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

AuthCredsSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const AuthCreds = mongoose.model<IAuthCreds>(
  "AuthCreds",
  AuthCredsSchema
);
