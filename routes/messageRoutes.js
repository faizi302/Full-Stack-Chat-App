import express from "express";
import { getMessagesByRoom } from "../controllers/messageController.js";

const router = express.Router();

router.get("/:roomId", getMessagesByRoom);

export default router;