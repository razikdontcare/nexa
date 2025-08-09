import mongoose, { Schema } from "mongoose";
import type { IUser } from "@/types";

const UserSchema = new Schema({
  jid: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  phoneNumber: {
    type: String,
    index: true,
  },
  name: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ["active", "inactive", "blocked"],
    default: "active",
  },
  lastSeen: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

UserSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const User = mongoose.model<IUser>("User", UserSchema);
