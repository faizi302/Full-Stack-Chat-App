// routes/userRoutes.js
import express from "express";
import {
  getAllUsers,
  getUserById,
  deleteUser,
  toggleUserStatus,
  getVisibleUsers,
  setVisibleUsers,
} from "../controllers/authController.js";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";

const router = express.Router();

// Any logged-in user — gets filtered list based on visibility permissions
router.get("/", authMiddleware, getAllUsers);

// Any logged-in user — get one user by ID
router.get("/:id", authMiddleware, getUserById);

// Admin only — delete user
router.delete("/:id", authMiddleware, adminMiddleware, deleteUser);

// Admin only — toggle enable/disable
router.patch("/:id/toggle-status", authMiddleware, adminMiddleware, toggleUserStatus);

// Admin only — get which users are visible to user :id in their sidebar
router.get("/:id/visible-users", authMiddleware, adminMiddleware, getVisibleUsers);

// Admin only — set which users are visible to user :id in their sidebar
router.put("/:id/visible-users", authMiddleware, adminMiddleware, setVisibleUsers);

export default router;