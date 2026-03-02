// controllers/authController.js
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Joi from "joi";

// ── Validation ─────────────────────────────────────────────────
const signupSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().min(7).max(15).required(),
  profileImage: Joi.string().uri().allow("").optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const updateSchema = Joi.object({
  name: Joi.string().min(2).max(50).optional(),
  phone: Joi.string().min(7).max(15).optional(),
  profileImage: Joi.string().uri().allow("").optional(),
});

// ── Format user for response ───────────────────────────────────
const formatUser = (user) => ({
  _id: user._id,
  name: user.name,
  nickName: user.nickName || user.name,
  email: user.email,
  phone: user.phone,
  profileImage: user.profileImage || "",
  role: user.role,
  isActive: user.isActive !== false,
  lastSeen: user.lastSeen,
  createdAt: user.createdAt,
  // visibleTo: we don't expose this to clients for security
});

// ── Set JWT cookie ─────────────────────────────────────────────
const setTokenCookie = (res, user) => {
  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  // Vercel deployments are always production (HTTPS)
  const isProduction = process.env.NODE_ENV === "production";

  res.cookie("token", token, {
    httpOnly: true,
    secure: true,            // MUST be true for SameSite: 'none'
    sameSite: "none",        // MUST be 'none' because domains are different
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
};

// ── SIGNUP ─────────────────────────────────────────────────────
export const signup = async (req, res) => {
  const { error } = signupSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const { name, email, password, phone, profileImage = "" } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      nickName: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      phone: phone.trim(),
      profileImage: profileImage || "",
      role: "user",
      isActive: true,
      visibleTo: [],
    });

    setTokenCookie(res, user);
    return res.status(201).json({ user: formatUser(user) });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ message: err.message || "Signup failed" });
  }
};

// ── LOGIN ──────────────────────────────────────────────────────
export const login = async (req, res) => {
  const { error } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password" });

    // Fresh token is issued with current role from DB — so if role was changed in DB,
    // the new token will reflect that after next login
    setTokenCookie(res, user);
    return res.json({ user: formatUser(user) });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: err.message || "Login failed" });
  }
};

// ── LOGOUT ─────────────────────────────────────────────────────
export const logout = async (req, res) => {
  res.clearCookie("token", { httpOnly: true, sameSite: "lax", path: "/" });
  return res.json({ message: "Logged out" });
};

// ── GET ME ─────────────────────────────────────────────────────
export const getMe = async (req, res) => {
  try {
    // Always fetch fresh from DB so role changes are reflected
    const user = await User.findById(req.user.id).select("-password").lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ user: formatUser(user) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── UPDATE PROFILE ─────────────────────────────────────────────
export const updateUser = async (req, res) => {
  const { error } = updateSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const updateData = {};
    if (req.body.name?.trim()) {
      updateData.name = req.body.name.trim();
      updateData.nickName = req.body.name.trim();
    }
    if (req.body.phone?.trim()) updateData.phone = req.body.phone.trim();
    if (req.body.profileImage !== undefined) updateData.profileImage = req.body.profileImage;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true, runValidators: false }
    ).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ user: formatUser(user) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── GET ALL USERS ──────────────────────────────────────────────
// Admin → sees ALL users
// Regular user → sees only users they have permission to see (visibleTo contains their ID)
export const getAllUsers = async (req, res) => {
  try {
    if (req.user.role === "admin") {
      const users = await User.find().select("-password").lean();
      return res.json(users.map(formatUser));
    } else {
      // Only show users where req.user.id is in their visibleTo array
      // Always include admins so users can always message admins
      const users = await User.find({
        $or: [
          { visibleTo: req.user.id },
          { role: "admin" },
        ],
        _id: { $ne: req.user.id }, // exclude self
      }).select("-password").lean();
      return res.json(users.map(formatUser));
    }
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── GET USER BY ID ─────────────────────────────────────────────
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password").lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(formatUser(user));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── ADMIN: DELETE USER ─────────────────────────────────────────
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    // Also remove this user from all others' visibleTo arrays
    await User.updateMany({ visibleTo: req.params.id }, { $pull: { visibleTo: req.params.id } });
    return res.json({ message: "User deleted" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── ADMIN: TOGGLE ACTIVE STATUS ────────────────────────────────
export const toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.isActive = user.isActive === false ? true : false;
    await user.save({ validateBeforeSave: false });
    return res.json({ user: formatUser(user) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── ADMIN: GET WHO A SPECIFIC USER CAN SEE IN SIDEBAR ─────────
// Returns list of user IDs that are visible to targetUserId
export const getVisibleUsers = async (req, res) => {
  try {
    const { id } = req.params; // the user we're configuring
    // Find all users that have `id` in their visibleTo array
    const visibleUsers = await User.find({ visibleTo: id }).select("_id").lean();
    const visibleUserIds = visibleUsers.map(u => u._id.toString());
    return res.json({ visibleUserIds });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── ADMIN: SET WHICH USERS ARE VISIBLE TO A SPECIFIC USER ─────
// Body: { visibleUserIds: ["id1", "id2", ...] }
// This sets: user with `id` can see exactly these users in their sidebar
export const setVisibleUsers = async (req, res) => {
  try {
    const { id } = req.params;          // the user being configured (the viewer)
    const { visibleUserIds = [] } = req.body;  // which users they're allowed to see

    // Step 1: Remove `id` from ALL users' visibleTo arrays (reset)
    await User.updateMany(
      { visibleTo: id },
      { $pull: { visibleTo: id } }
    );

    // Step 2: Add `id` to each selected user's visibleTo array
    // Meaning: each selected user becomes visible to `id`
    if (visibleUserIds.length > 0) {
      await User.updateMany(
        { _id: { $in: visibleUserIds } },
        { $addToSet: { visibleTo: id } }
      );
    }

    return res.json({ success: true, visibleUserIds });
  } catch (err) {
    console.error("setVisibleUsers error:", err);
    return res.status(500).json({ message: err.message });
  }
};