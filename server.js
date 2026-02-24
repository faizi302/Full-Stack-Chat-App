// server.js
// ── IMPORTANT: dotenv MUST be the very first thing ─────────────
// In ES modules, all `import` statements are hoisted and their
// module-level code runs BEFORE any code here. To guarantee .env
// is loaded first, we use a separate env.js file that's imported first.
import "./config/env.js" // loads dotenv before anything else

import express from "express";
import http from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";

import connectDB from "./config/db.js";
import authRoutes    from "./routes/authRoutes.js";
import userRoutes    from "./routes/userRoutes.js";
import roomRoutes    from "./routes/roomRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import { socketHandler }    from "./controllers/socketController.js";
import { uploadFile, upload } from "./controllers/uploadController.js";

connectDB();

const app = express();

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/api/auth",     authRoutes);
app.use("/api/users",    userRoutes);
app.use("/api/rooms",    roomRoutes);
app.use("/api/messages", messageRoutes);

// Upload — public so users can upload profile image before login
app.post("/api/upload", upload.single("file"), uploadFile);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

socketHandler(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`   Cloudinary configured: ${process.env.CLOUDINARY_CLOUD_NAME ? "✅ YES" : "❌ NO — check .env"}`);
  console.log(`   MongoDB: connecting...`);
});