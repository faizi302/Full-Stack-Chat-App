// controllers/socketController.js
import jwt from "jsonwebtoken";
import Message from "../models/Message.js";
import Room from "../models/Room.js";
import User from "../models/User.js";

const onlineUsers  = {};
const typingInRoom = {};

const isRoomAdmin = (room, userId) => {
  const id = userId.toString();
  return (
    room.mainAdmin?.toString() === id ||
    room.groupAdmins?.some(a => a.toString() === id)
  );
};

export const socketHandler = (io) => {

  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers?.cookie || "";
      const cookieToken = cookieHeader
        .split(";")
        .map(c => c.trim())
        .find(c => c.startsWith("token="))
        ?.split("=")[1];

      const token = cookieToken || socket.handshake.auth?.token;
      if (!token) return next(new Error("No auth token — please log in"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");
      if (!user) return next(new Error("User not found"));

      socket.user = user;
      next();
    } catch (err) {
      console.error("Socket auth error:", err.message);
      next(new Error("Authentication failed: " + err.message));
    }
  });

  io.on("connection", async (socket) => {
    const user = socket.user;
    const userName = user.nickName || user.name;

    console.log(`✅ Socket connected: ${socket.id} → ${userName}`);

    onlineUsers[socket.id] = {
      userId: user._id.toString(),
      nickName: userName,
    };

    socket.join(user._id.toString());

    const userRooms = await Room.find({ members: user._id }).select("_id");
    userRooms.forEach(room => socket.join(room._id.toString()));

    io.emit("user_status", { userId: user._id.toString(), status: "online" });

    socket.emit(
      "online_list",
      [...new Set(Object.values(onlineUsers).map(u => u.userId))]
    );

    // ── join_room ────────────────────────────────────────────────
    socket.on("join_room", async ({ roomId }) => {
      try {
        const room = await Room.findById(roomId);
        if (!room) return;

        // App admins can join any room to view
        const isAppAdmin = user.role === "admin";
        const isMember = room.members.some(m => m.toString() === user._id.toString());
        if (!isAppAdmin && !isMember) return;

        socket.join(roomId);

        const messages = await Message.find({ roomId })
          .sort({ createdAt: 1 })
          .limit(200)
          .populate({
            path: "repliedTo",
            select: "content senderName senderId mediaType mediaUrl createdAt",
          });

        socket.emit("room_history", messages);
      } catch (err) {
        console.error("join_room error:", err);
      }
    });

    // ── send_message ─────────────────────────────────────────────
    socket.on("send_message", async ({ roomId, content, mediaType, mediaUrl, repliedTo }) => {
      try {
        const room = await Room.findById(roomId);
        if (!room) return;

        const userId = user._id.toString();
        const isAppAdmin = user.role === "admin";
        const isMember = room.members.some(m => m.toString() === userId);
        const isGroupAdmin = isRoomAdmin(room, userId);

        // Enforce onlyAdminCanSend
        if (room.onlyAdminCanSend && !isGroupAdmin && !isAppAdmin) {
          socket.emit("send_error", { message: "Only admins can send messages in this group" });
          return;
        }

        // Must be a member or app admin to send
        if (!isMember && !isAppAdmin) return;

        const newMessage = new Message({
          roomId,
          senderId: user._id,
          senderName: userName,
          content,
          mediaType: mediaType || "text",
          mediaUrl: mediaUrl || "",
          repliedTo: repliedTo || null,
          roomMembersCount: room.members.length,
        });

        await newMessage.save();

        const populatedMsg = await Message.findById(newMessage._id).populate({
          path: "repliedTo",
          select: "content senderName senderId mediaType mediaUrl createdAt",
        });

        io.to(roomId).emit("new_message", populatedMsg);
      } catch (err) {
        console.error("send_message error:", err);
      }
    });

    // ── leave_room ───────────────────────────────────────────────
    socket.on("leave_room", async ({ roomId, userId }) => {
      try {
        const room = await Room.findById(roomId);
        if (!room || room.type !== "group") return;

        room.members = room.members.filter(m => m.toString() !== userId);
        room.groupAdmins = room.groupAdmins?.filter(a => a.toString() !== userId) || [];
        await room.save();

        socket.leave(roomId);
        io.to(roomId).emit("room_updated", room);
      } catch (err) {
        console.error("leave_room error:", err);
      }
    });

    // ── room_updated relay ───────────────────────────────────────
    socket.on("room_updated", data => {
      if (data._id) io.to(data._id.toString()).emit("room_updated", data);
      else io.emit("room_updated", data);
    });

    // ── add_reaction ─────────────────────────────────────────────
    socket.on("add_reaction", async ({ messageId, emoji }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;

        const userId = user._id.toString();
        const existing = message.reactions.find(r => r.emoji === emoji);

        if (existing) {
          if (!existing.userIds.map(String).includes(userId)) {
            existing.userIds.push(user._id);
          }
        } else {
          message.reactions.push({ emoji, userIds: [user._id] });
        }

        await message.save();

        io.to(message.roomId.toString()).emit("reaction_updated", {
          messageId,
          reactions: message.reactions,
        });
      } catch (err) {
        console.error("add_reaction error:", err);
      }
    });

    // ── typing indicators ────────────────────────────────────────
    socket.on("typing_start", ({ roomId }) => {
      if (!roomId) return;
      if (!typingInRoom[roomId]) typingInRoom[roomId] = new Set();
      typingInRoom[roomId].add(user._id.toString());
      io.to(roomId).emit("typing_users", {
        roomId,
        typing: Array.from(typingInRoom[roomId]),
      });
    });

    socket.on("typing_stop", ({ roomId }) => {
      if (!roomId || !typingInRoom[roomId]) return;
      typingInRoom[roomId].delete(user._id.toString());
      if (typingInRoom[roomId].size === 0) delete typingInRoom[roomId];
      io.to(roomId).emit("typing_users", {
        roomId,
        typing: typingInRoom[roomId] ? Array.from(typingInRoom[roomId]) : [],
      });
    });

    // ── message receipts ─────────────────────────────────────────
    socket.on("message_delivered", async ({ messageId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;
        if (message.senderId.toString() === user._id.toString()) return;
        if (message.deliveredTo.map(String).includes(user._id.toString())) return;

        message.deliveredTo.push(user._id);
        await message.save({ validateBeforeSave: false });

        const room = await Room.findById(message.roomId);
        io.to(message.roomId.toString()).emit("message_receipt_updated", {
          messageId: message._id.toString(),
          deliveredCount: message.deliveredTo.length,
          readCount: message.readBy.length,
          isGroup: room?.type === "group",
        });
      } catch (err) {
        console.error("message_delivered error:", err);
      }
    });

    socket.on("mark_delivered", async ({ messageIds, roomId }) => {
      try {
        const messages = await Message.find({
          _id: { $in: messageIds },
          roomId,
          senderId: { $ne: user._id },
          deliveredTo: { $ne: user._id },
        });

        for (const msg of messages) {
          msg.deliveredTo.push(user._id);
          await msg.save({ validateBeforeSave: false });
        }

        if (messages.length > 0) {
          const room = await Room.findById(roomId);
          io.to(roomId).emit("messages_receipts_updated", {
            updatedMessages: messages.map(m => ({
              messageId: m._id.toString(),
              deliveredCount: m.deliveredTo.length,
              readCount: m.readBy.length,
            })),
            isGroup: room?.type === "group",
          });
        }
      } catch (err) {
        console.error("mark_delivered error:", err);
      }
    });

    socket.on("mark_read", async ({ messageIds, roomId }) => {
      try {
        const room = await Room.findById(roomId);
        if (!room) return;

        const messages = await Message.find({
          _id: { $in: messageIds },
          roomId,
          senderId: { $ne: user._id },
          readBy: { $ne: user._id },
        });

        for (const msg of messages) {
          msg.readBy.push(user._id);
          await msg.save({ validateBeforeSave: false });
        }

        if (messages.length > 0) {
          io.to(roomId).emit("messages_receipts_updated", {
            updatedMessages: messages.map(m => ({
              messageId: m._id.toString(),
              deliveredCount: m.deliveredTo.length,
              readCount: m.readBy.length,
            })),
            isGroup: room?.type === "group",
          });
        }
      } catch (err) {
        console.error("mark_read error:", err);
      }
    });

    socket.on("get_message_readers", async ({ messageId }) => {
      try {
        const message = await Message.findById(messageId)
          .populate("readBy", "nickName name profileImage");
        if (!message) return;
        socket.emit("message_readers", {
          messageId,
          readers: message.readBy.map(u => ({
            id: u._id.toString(),
            name: u.nickName || u.name,
            profileImage: u.profileImage || "",
          })),
        });
      } catch (err) {
        console.error("get_message_readers error:", err);
      }
    });

    socket.on("user_updated", data => io.emit("user_updated", data));

    // ── disconnect ───────────────────────────────────────────────
    socket.on("disconnect", async () => {
      const now = new Date();
      try { await User.findByIdAndUpdate(user._id, { lastSeen: now }); } catch {}

      io.emit("user_status", {
        userId: user._id.toString(),
        status: "offline",
        lastSeen: now.toISOString(),
      });

      delete onlineUsers[socket.id];

      Object.keys(typingInRoom).forEach(roomId => {
        if (typingInRoom[roomId]?.has(user._id.toString())) {
          typingInRoom[roomId].delete(user._id.toString());
          io.to(roomId).emit("typing_users", {
            roomId,
            typing: Array.from(typingInRoom[roomId] || []),
          });
        }
      });

      console.log(`❌ Socket disconnected: ${socket.id}`);
    });
  });
};