// controllers/uploadController.js
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";

// Store files in memory (no disk writes)
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

export const uploadFile = async (req, res) => {
  try {
    // ── Configure Cloudinary HERE (inside the function, not at module level) ──
    // This is important! In ES modules with dotenv, the module-level code runs
    // BEFORE dotenv.config() in server.js, so env vars aren't loaded yet.
    // By configuring inside the function, we ensure .env is already loaded.
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key:    process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    // ── Check env vars are present ──────────────────────────────
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY    ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      console.error("❌ Missing Cloudinary env vars:");
      console.error("   CLOUDINARY_CLOUD_NAME:", process.env.CLOUDINARY_CLOUD_NAME || "MISSING");
      console.error("   CLOUDINARY_API_KEY:", process.env.CLOUDINARY_API_KEY ? "set" : "MISSING");
      console.error("   CLOUDINARY_API_SECRET:", process.env.CLOUDINARY_API_SECRET ? "set" : "MISSING");
      return res.status(500).json({
        message: "Upload not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET to your .env file.",
      });
    }

    // ── Check file was sent ─────────────────────────────────────
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const file = req.file;
    console.log(`📤 Uploading: ${file.originalname} | ${file.mimetype} | ${Math.round(file.size / 1024)}KB`);

    // ── Determine Cloudinary resource type ──────────────────────
    let resourceType = "raw";
    let mediaType    = "file";

    if (file.mimetype.startsWith("image/")) {
      resourceType = "image";
      mediaType    = "image";
    } else if (file.mimetype.startsWith("video/")) {
      resourceType = "video";
      mediaType    = "video";
    }

    // ── Upload to Cloudinary ────────────────────────────────────
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: resourceType,
          folder: "chat-app",
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(file.buffer);
    });

    console.log("✅ Upload success:", result.secure_url);
    return res.json({ url: result.secure_url, mediaType });

  } catch (err) {
    console.error("Upload error:", err.message);
    return res.status(500).json({
      message: err.message || "Upload failed",
    });
  }
};