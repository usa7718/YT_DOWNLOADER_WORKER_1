const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
app.use(express.json());

// CONFIG
const PORT = process.env.PORT || 4001;
const MASTER_URL = "https://yt-downloader-api-s7.onrender.com";
const MY_WORKER_URL = process.env.WORKER_URL || `http://localhost:${PORT}`; 

const CLUSTER_SECRET = "MY_SUPER_SECRET_KEY"; 

const TEMP_DIR = path.join(__dirname, "temp");
const COOKIES_PATH = path.join(__dirname, "cookies.txt");

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

/* =========================================
   💓 HEARTBEAT LOGIC (Connects to Master)
========================================= */
const pingMaster = async () => {
  try {
    await axios.post(`${MASTER_URL}/cluster/ping`, {
      url: MY_WORKER_URL,
      secret: CLUSTER_SECRET
    });
    console.log("📡 Ping sent to Master...");
  } catch (err) {
    console.error("❌ Master connection failed. Retrying in 10s...");
  }
};

setInterval(pingMaster, 20000); // 20 sec heartbeat
pingMaster(); // Boot up ping

/* =========================================
   ⚙️ JOB EXECUTION (yt-dlp + ffmpeg)
========================================= */

app.post("/execute", (req, res) => {
  if (req.headers["x-cluster-secret"] !== CLUSTER_SECRET) return res.status(403).send("Forbidden");

  const { type, url, quality } = req.body;
  const jobId = Date.now();
  
  console.log(`📥 Processing ${type} | ${quality || 'audio'} | ${url}`);

  let cmd = "";
  let fileName = "";
  let mimeType = "";

  const commonArgs = `--cookies "${COOKIES_PATH}" --no-playlist --extractor-args "youtube:player_client=android"`;

  if (type === "video") {
    fileName = `video_${jobId}.mp4`;
    mimeType = "video/mp4";
    
    // Quality Logic
    let format = "";
    if (quality === "max") {
      format = "bv*[fps>30]/bv*+ba/best";
    } else {
      format = `bv*[height<=${quality}][fps>30]/bv*[height<=${quality}]+ba/best`;
    }

    cmd = `yt-dlp ${commonArgs} -f "${format}" --merge-output-format mp4 "${url}" -o "${path.join(TEMP_DIR, fileName)}"`;

  } else {
    fileName = `audio_${jobId}.mp3`;
    mimeType = "audio/mpeg";
    cmd = `yt-dlp ${commonArgs} -x --audio-format mp3 --audio-quality 0 "${url}" -o "${path.join(TEMP_DIR, fileName)}"`;
  }

  // Execute yt-dlp
  exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (err, stdout, stderr) => {
    const filePath = path.join(TEMP_DIR, fileName);

    if (err || !fs.existsSync(filePath)) {
      console.error(`❌ yt-dlp Error:`, stderr);
      return res.status(500).json({ error: "Download Failed", details: stderr });
    }

    // Stream back to Master
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Type", mimeType);
    
    res.sendFile(filePath, (sendErr) => {
      if (!sendErr) {
        fs.unlink(filePath, () => console.log(`🧹 Cleaned up: ${fileName}`));
      }
    });
  });
});

/* =========================================
   🧹 FAILSAVE CLEANER
========================================= */
setInterval(() => {
  fs.readdir(TEMP_DIR, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const p = path.join(TEMP_DIR, file);
      const stat = fs.statSync(p);
      if (Date.now() - stat.mtimeMs > 3600000) fs.unlink(p, () => {}); // 1hr old files delete
    });
  });
}, 600000);

app.listen(PORT, () => console.log(`🧵 Worker online at ${PORT}`));
