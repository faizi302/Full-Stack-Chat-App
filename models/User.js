// models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    nickName:     { type: String, trim: true, default: "" },
    email:        { type: String, required: true, unique: true, trim: true },
    password:     { type: String, required: true },
    phone:        { type: String, required: true, trim: true },
    profileImage: { type: String, default: "" },
    role:         { type: String, enum: ["user", "admin"], default: "user" },
    rooms:        [{ type: mongoose.Schema.Types.ObjectId, ref: "Room" }],
    lastSeen:     { type: Date, default: null },
    isActive:     { type: Boolean, default: true },

    // Sidebar visibility permission system:
    // This array stores which user IDs are allowed to see THIS user in their sidebar.
    // Example: if Ali's _id is in Bob's visibleTo array → Bob can see Ali in his sidebar.
    // Admin manages this from the dashboard. Empty = nobody can see this user (except admins).
    visibleTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);