// roomController.js
import mongoose from "mongoose";
import Room from "../models/Room.js";
import User from "../models/User.js";
import Message from "../models/Message.js";

// ── Helper: check if a userId is admin of a room ───────────────
const isRoomAdmin = (room, userId) => {
  const id = userId.toString();
  return (
    room.mainAdmin?.toString() === id ||
    room.groupAdmins?.some(a => a.toString() === id)
  );
};

export const createOrGetRoom = async (req, res) => {
  try {
    const { name, members, type, profileImage = "" } = req.body;

    if (!type || !["private", "group"].includes(type)) {
      return res.status(400).json({ message: "Invalid room type" });
    }

    if (!Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ message: "At least one member is required" });
    }

    const memberIds = members.map(id => {
      try { return new mongoose.Types.ObjectId(id); }
      catch { return null; }
    }).filter(Boolean);

    if (memberIds.length !== members.length) {
      return res.status(400).json({ message: "One or more member IDs are invalid" });
    }

    let room;

    if (type === "private") {
      if (memberIds.length !== 2) {
        return res.status(400).json({ message: "Private chat needs exactly 2 members" });
      }
      room = await Room.findOne({
        type: "private",
        members: { $all: memberIds, $size: 2 },
      }).populate("members", "nickName lastSeen profileImage name");
    } else if (type === "group") {
      if (!name?.trim()) {
        return res.status(400).json({ message: "Group name is required" });
      }

      room = await Room.findOne({ name: name.trim(), type: "group" });

      if (room) {
        await Room.updateOne(
          { _id: room._id },
          { $addToSet: { members: { $each: memberIds } } }
        );
        await User.updateMany(
          { _id: { $in: memberIds } },
          { $addToSet: { rooms: room._id } }
        );
        room = await Room.findById(room._id).populate("members", "nickName lastSeen profileImage name");
        return res.status(200).json(room);
      }
    }

    if (!room) {
      // Creator becomes the main admin for group rooms
      const creatorId = memberIds[0];
      const newRoom = new Room({
        name: type === "group" ? name.trim() : undefined,
        members: memberIds,
        type,
        profileImage: type === "group" ? profileImage : "",
        mainAdmin: type === "group" ? creatorId : null,
        groupAdmins: [],
        onlyAdminCanSend: false,
      });

      await newRoom.save();
      await User.updateMany(
        { _id: { $in: memberIds } },
        { $addToSet: { rooms: newRoom._id } }
      );
      room = await Room.findById(newRoom._id).populate("members", "nickName lastSeen profileImage name");
      return res.status(201).json(room);
    }

    res.status(200).json(room);
  } catch (err) {
    console.error("[createOrGetRoom] Error:", err);
    res.status(500).json({ message: err.message });
  }
};

export const getUserRooms = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const rooms = await Room.find({ members: userId })
      .populate("members", "nickName lastSeen profileImage name")
      .sort({ lastActivity: -1 })
      .lean();

    const roomsWithUnread = await Promise.all(
      rooms.map(async (room) => {
        const unreadCount = await Message.countDocuments({
          roomId: room._id,
          senderId: { $ne: userId },
          readBy: { $ne: userId },
        });
        return { ...room, unreadCount: unreadCount || 0 };
      })
    );

    res.json(roomsWithUnread);
  } catch (error) {
    console.error("[getUserRooms] Error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const updateRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, profileImage } = req.body;

    const room = await Room.findById(id);
    if (!room) return res.status(404).json({ message: "Room not found" });

    const requesterId = req.user.id;
    const isAppAdmin = req.user.role === "admin";

    if (!isAppAdmin && !isRoomAdmin(room, requesterId)) {
      return res.status(403).json({ message: "Only group admins can update the group" });
    }

    const updateData = {};
    if (name?.trim()) updateData.name = name.trim();
    if (profileImage !== undefined) updateData.profileImage = profileImage;

    const updated = await Room.findByIdAndUpdate(id, updateData, { new: true })
      .populate("members", "nickName lastSeen profileImage name");

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── Add member to group ────────────────────────────────────────
export const addMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const requesterId = req.user.id;
    const isAppAdmin = req.user.role === "admin";

    const room = await Room.findById(id);
    if (!room || room.type !== "group") return res.status(404).json({ message: "Group not found" });

    if (!isAppAdmin && !isRoomAdmin(room, requesterId)) {
      return res.status(403).json({ message: "Only group admins can add members" });
    }

    await Room.updateOne({ _id: id }, { $addToSet: { members: userId } });
    await User.updateOne({ _id: userId }, { $addToSet: { rooms: id } });

    const updated = await Room.findById(id).populate("members", "nickName lastSeen profileImage name");
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Remove member from group ───────────────────────────────────
export const removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const requesterId = req.user.id;
    const isAppAdmin = req.user.role === "admin";

    const room = await Room.findById(id);
    if (!room || room.type !== "group") return res.status(404).json({ message: "Group not found" });

    if (!isAppAdmin && !isRoomAdmin(room, requesterId)) {
      return res.status(403).json({ message: "Only group admins can remove members" });
    }

    // Cannot remove main admin (unless app admin)
    if (!isAppAdmin && room.mainAdmin?.toString() === userId) {
      return res.status(403).json({ message: "Cannot remove the main admin" });
    }

    await Room.updateOne({ _id: id }, {
      $pull: { members: userId, groupAdmins: userId },
    });
    await User.updateOne({ _id: userId }, { $pull: { rooms: id } });

    const updated = await Room.findById(id).populate("members", "nickName lastSeen profileImage name");
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Promote member to sub-admin ───────────────────────────────
export const promoteToAdmin = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const requesterId = req.user.id;
    const isAppAdmin = req.user.role === "admin";

    const room = await Room.findById(id);
    if (!room || room.type !== "group") return res.status(404).json({ message: "Group not found" });

    // Only main admin or app admin can promote
    if (!isAppAdmin && room.mainAdmin?.toString() !== requesterId) {
      return res.status(403).json({ message: "Only the main admin can promote members" });
    }

    await Room.updateOne({ _id: id }, { $addToSet: { groupAdmins: userId } });
    const updated = await Room.findById(id).populate("members", "nickName lastSeen profileImage name");
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Demote sub-admin to member ────────────────────────────────
export const demoteAdmin = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const requesterId = req.user.id;
    const isAppAdmin = req.user.role === "admin";

    const room = await Room.findById(id);
    if (!room || room.type !== "group") return res.status(404).json({ message: "Group not found" });

    if (!isAppAdmin && room.mainAdmin?.toString() !== requesterId) {
      return res.status(403).json({ message: "Only the main admin can demote admins" });
    }

    await Room.updateOne({ _id: id }, { $pull: { groupAdmins: userId } });
    const updated = await Room.findById(id).populate("members", "nickName lastSeen profileImage name");
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Toggle onlyAdminCanSend ───────────────────────────────────
export const toggleAdminOnlySend = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.user.id;
    const isAppAdmin = req.user.role === "admin";

    const room = await Room.findById(id);
    if (!room || room.type !== "group") return res.status(404).json({ message: "Group not found" });

    if (!isAppAdmin && !isRoomAdmin(room, requesterId)) {
      return res.status(403).json({ message: "Only group admins can change this setting" });
    }

    room.onlyAdminCanSend = !room.onlyAdminCanSend;
    await room.save();

    const updated = await Room.findById(id).populate("members", "nickName lastSeen profileImage name");
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Delete group (main admin or app admin only) ───────────────
export const deleteRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.user.id;
    const isAppAdmin = req.user.role === "admin";

    const room = await Room.findById(id);
    if (!room) return res.status(404).json({ message: "Room not found" });

    if (!isAppAdmin && room.mainAdmin?.toString() !== requesterId) {
      return res.status(403).json({ message: "Only the main admin can delete this group" });
    }

    await Message.deleteMany({ roomId: id });
    await Room.findByIdAndDelete(id);
    await User.updateMany({}, { $pull: { rooms: id } });

    res.json({ message: "Group deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Clear chat (app admin only) ───────────────────────────────
export const clearChat = async (req, res) => {
  try {
    const { id } = req.params;
    const isAppAdmin = req.user.role === "admin";
    const requesterId = req.user.id;

    const room = await Room.findById(id);
    if (!room) return res.status(404).json({ message: "Room not found" });

    if (!isAppAdmin && !isRoomAdmin(room, requesterId)) {
      return res.status(403).json({ message: "Only admins can clear chat" });
    }

    await Message.deleteMany({ roomId: id });
    res.json({ message: "Chat cleared" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get all groups (app admin only) ──────────────────────────
export const getAllRooms = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    const rooms = await Room.find({ type: "group" })
      .populate("members", "nickName name profileImage")
      .populate("mainAdmin", "nickName name profileImage")
      .populate("groupAdmins", "nickName name profileImage")
      .sort({ lastActivity: -1 });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};