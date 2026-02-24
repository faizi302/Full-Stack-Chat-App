// userController.js
import User from "../models/User.js";

export const createOrGetUser = async (req, res) => {
  try {
    const { nickName, profileImage = "" } = req.body;
    if (!nickName?.trim()) {
      return res.status(400).json({ message: "Nickname is required" });
    }

    let user = await User.findOne({ nickName: nickName.trim() });
    if (!user) {
      user = await User.create({ nickName: nickName.trim(), profileImage });
    }

    res.status(200).json({
      _id: user._id,
      nickName: user.nickName,
      profileImage: user.profileImage || "",
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("nickName lastSeen profileImage");
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("nickName lastSeen profileImage");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { nickName, profileImage } = req.body;

    if (!nickName && profileImage === undefined) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const updateData = {};
    if (nickName?.trim()) {
      const existing = await User.findOne({ nickName: nickName.trim(), _id: { $ne: id } });
      if (existing) {
        return res.status(409).json({ message: "Nickname taken" });
      }
      updateData.nickName = nickName.trim();
    }
    if (profileImage !== undefined) {
      updateData.profileImage = profileImage;
    }

    const user = await User.findByIdAndUpdate(id, updateData, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      _id: user._id,
      nickName: user.nickName,
      profileImage: user.profileImage || "",
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};