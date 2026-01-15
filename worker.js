/**
 * ZORO x S7 – YT-DLP WORKER SERVER
 * Runs yt-dlp + ffmpeg
 * Uses cookies
 * Supports: video, audio, max quality, 60fps+
 */

const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();

/* =========================
   ⚙️ CONFIG
========================= */
const PORT = process.env.PORT || 4001;

// cookies.txt must exist in same folder
const COOKIES_PATH = path.join(__dirname, "cookies.txt");

// temp folder (important for Render / Railway)
const TEMP_DIR = path.join(__dirname, "temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// force temp usage
process.env.TMPDIR = TEMP_DIR;
process.env.TEMP = TEMP_DIR;
process.env.TMP = TEMP_DIR;

/* =========================
   🟢 HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.json({
    status: "WORKER ONLINE ✅",
    engine: "yt-dlp",
    cookies: fs.existsSync(COOKIES_PATH),
    port: PORT
  });
});

/* =========================
   🎥 VIDEO DOWNLOAD
========================= */
app.get("/video", (req, res) => {
  const { url, quality } = req.query;
  if (!url || !quality) {
    return res.status(400).json({ error: "url & quality required" });
  }

  const fileName = `video_${Date.now()}.mp4`;
  const filePath = path.join(TEMP_DIR, fileName);

  // 🎯 FORMAT LOGIC
  let format;
  if (quality === "max") {
    // MAX = best resolution + best fps (60/120 if available)
    format = "bv*[fps>30]/bv*+ba/best";
  } else {
    // specific resolution with preference to 60fps
    format = `bv*[height<=${quality}][fps>30]/bv*[height<=${quality}]+ba/best`;
  }

  const cmd = `
yt-dlp
--cookies "${COOKIES_PATH}"
--no-playlist
--extractor-args "youtube:player_client=android"
--merge-output-format mp4
-f "${format}"
"${url}"
-o "${filePath}"
`.replace(/\n/g, " ");

  console.log(`🎥 VIDEO | ${quality} | ${url}`);

  exec(cmd, { maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
    if (err || !fs.existsSync(filePath)) {
      console.error("❌ VIDEO FAILED:", stderr || err);
      return res.status(500).json({ error: "video download failed" });
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );
    res.setHeader("Content-Type", "video/mp4");

    res.sendFile(filePath, () => {
      fs.unlink(filePath, () => {});
      console.log(`🧹 CLEANED: ${fileName}`);
    });
  });
});

/* =========================
   🎵 AUDIO MP3
========================= */
app.get("/audio", (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url required" });

  const fileName = `audio_${Date.now()}.mp3`;
  const filePath = path.join(TEMP_DIR, fileName);

  const cmd = `
yt-dlp
--cookies "${COOKIES_PATH}"
--no-playlist
-x
--audio-format mp3
--audio-quality 0
"${url}"
-o "${filePath}"
`.replace(/\n/g, " ");

  console.log(`🎵 AUDIO | ${url}`);

  exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err) => {
    if (err || !fs.existsSync(filePath)) {
      console.error("❌ AUDIO FAILED");
      return res.status(500).json({ error: "audio download failed" });
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );
    res.setHeader("Content-Type", "audio/mpeg");

    res.sendFile(filePath, () => {
      fs.unlink(filePath, () => {});
      console.log(`🧹 CLEANED: ${fileName}`);
    });
  });
});

/* =========================
   🧹 AUTO CLEAN (Failsafe)
========================= */
setInterval(() => {
  fs.readdir(TEMP_DIR, (err, files) => {
    if (err) return;
    files.forEach(f => {
      const p = path.join(TEMP_DIR, f);
      fs.stat(p, (e, s) => {
        if (!e && Date.now() - s.mtimeMs > 60 * 60 * 1000) {
          fs.unlink(p, () => {});
        }
      });
    });
  });
}, 30 * 60 * 1000);

/* =========================
   🚀 START
========================= */
app.listen(PORT, () => {
  console.log(`
=====================================
🧵 WORKER STARTED
🌐 Port    : ${PORT}
🍪 Cookies : ${fs.existsSync(COOKIES_PATH)}
📂 Temp    : ${TEMP_DIR}
=====================================
`);
});