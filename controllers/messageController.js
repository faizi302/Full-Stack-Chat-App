// controllers/messageController.js
import Message from "../models/Message.js";

export const getMessagesByRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const messages = await Message.find({ roomId })
      .sort({ createdAt: 1 })
      .limit(200)
      .populate({
        path: 'repliedTo',
        select: 'content senderName senderId mediaType mediaUrl createdAt'
      });
    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: error.message });
  }
};