// models/Message.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  senderName: { type: String },
  content: { type: String },
  mediaType: { type: String, enum: ["text", "image", "video", "file"], default: "text" },
  mediaUrl: { type: String },
  type: { type: String, enum: ["user", "system"], default: "user" },

  deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  reactions: [{
    emoji: { type: String, required: true },
    userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
  }],

  repliedTo: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Message", 
    default: null 
  },
  replyCount: { 
    type: Number, 
    default: 0 
  },

  roomMembersCount: { type: Number },

}, { timestamps: true });

messageSchema.post("save", async function (doc) {
  try {
    await mongoose.model("Room").findByIdAndUpdate(doc.roomId, {
      lastActivity: doc.createdAt || new Date(),
    });

    if (doc.repliedTo) {
      await mongoose.model("Message").findByIdAndUpdate(
        doc.repliedTo,
        { $inc: { replyCount: 1 } }
      );
    }
  } catch (err) {
    console.error('Post-save hook error:', err);
  }
});

export default mongoose.model("Message", messageSchema);