// routes/roomRoutes.js
import express from "express";
import {
  createOrGetRoom,
  getUserRooms,
  updateRoom,
  addMember,
  removeMember,
  promoteToAdmin,
  demoteAdmin,
  toggleAdminOnlySend,
  deleteRoom,
  clearChat,
  getAllRooms,
} from "../controllers/roomController.js";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";

const router = express.Router();

// Create or get a room
router.post("/", authMiddleware, createOrGetRoom);

// Get all rooms for a user
router.get("/user/:userId", authMiddleware, getUserRooms);

// App admin: get all group rooms
router.get("/all", authMiddleware, adminMiddleware, getAllRooms);

// Update group name/image (group admin or app admin)
router.put("/:id", authMiddleware, updateRoom);

// Add member (group admin or app admin)
router.post("/:id/members", authMiddleware, addMember);

// Remove member (group admin or app admin)
router.delete("/:id/members/:userId", authMiddleware, removeMember);

// Promote to sub-admin (main admin or app admin)
router.post("/:id/admins/:userId", authMiddleware, promoteToAdmin);

// Demote sub-admin (main admin or app admin)
router.delete("/:id/admins/:userId", authMiddleware, demoteAdmin);

// Toggle onlyAdminCanSend (group admin or app admin)
router.patch("/:id/admin-only-send", authMiddleware, toggleAdminOnlySend);

// Delete group (main admin or app admin)
router.delete("/:id", authMiddleware, deleteRoom);

// Clear chat (group admin or app admin)
router.delete("/:id/messages", authMiddleware, clearChat);

export default router;