// models/Room.js
import mongoose from "mongoose";

const roomSchema = new mongoose.Schema({
  name: { type: String, trim: true, unique: true, sparse: true },
  profileImage: { type: String, default: "" },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  type: { type: String, enum: ["private", "group"], default: "group" },
  createdAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now },

  // Group Admin System
  mainAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  groupAdmins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Sub-admins
  onlyAdminCanSend: { type: Boolean, default: false }, // Restrict messaging to admins only
});

export default mongoose.model("Room", roomSchema);