const express = require("express");
const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

const app = express();
app.use(express.json({ limit: "2mb" }));

ffmpeg.setFfmpegPath(ffmpegPath);

function randomName(ext = "") {
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
}

async function downloadFile(url, outputPath) {
  const response = await axios({
    method: "GET",
    url,
    responseType: "stream",
    timeout: 120000,
    maxRedirects: 5,
    headers: {
      "User-Agent": "audio-extractor-api/1.0"
    }
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

function extractMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .audioChannels(2)
      .format("mp3")
      .on("end", resolve)
      .on("error", reject)
      .save(outputPath);
  });
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "audio-extractor-api"
  });
});

app.post("/extract-audio", async (req, res) => {
  const { video_url } = req.body || {};

  if (!video_url || typeof video_url !== "string") {
    return res.status(400).json({
      ok: false,
      error: "video_url is required and must be a string"
    });
  }

  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, randomName(".mp4"));
  const outputPath = path.join(tempDir, randomName(".mp3"));

  try {
    await downloadFile(video_url, inputPath);
    await extractMp3(inputPath, outputPath);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", 'attachment; filename="audio.mp3"');

    const readStream = fs.createReadStream(outputPath);
    readStream.pipe(res);

    readStream.on("close", async () => {
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (_) {}
    });
  } catch (error) {
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch (_) {}

    return res.status(500).json({
      ok: false,
      error: "Failed to extract audio",
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Audio extractor API running on port ${PORT}`);
});