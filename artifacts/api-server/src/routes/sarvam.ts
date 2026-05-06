import { Router } from "express";
import express from "express";

const router: ReturnType<typeof Router> = Router();

function getSarvamKey(): string {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new Error("SARVAM_API_KEY not configured");
  return key;
}

// POST /api/sarvam/stt
// Body: raw audio bytes (application/octet-stream)
// Query: lang=hi-IN
// Returns: { transcript: string }
router.post(
  "/sarvam/stt",
  express.raw({ type: "application/octet-stream", limit: "20mb" }),
  async (req, res) => {
    try {
      const key = getSarvamKey();
      const lang = (req.query["lang"] as string) ?? "hi-IN";
      const audioBuffer = req.body as Buffer;

      if (!audioBuffer || audioBuffer.length === 0) {
        res.status(400).json({ error: "No audio data received" });
        return;
      }

      const formData = new FormData();
      formData.append(
        "file",
        new Blob([new Uint8Array(audioBuffer)], { type: "audio/webm" }),
        "audio.webm",
      );
      formData.append("language_code", lang);
      formData.append("model", "saaras:v3");

      const response = await fetch("https://api.sarvam.ai/speech-to-text", {
        method: "POST",
        headers: { "api-subscription-key": key },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        req.log.error(
          { errText, status: response.status },
          "Sarvam STT upstream error",
        );
        res.status(502).json({ error: "Speech recognition failed" });
        return;
      }

      const data = (await response.json()) as { transcript?: string };
      res.json({ transcript: data.transcript ?? "" });
    } catch (err) {
      req.log.error({ err }, "Sarvam STT route error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/sarvam/tts
// Body: { text: string, language_code: string, speaker: string }
// Returns: { audio: string } (base64 WAV)
router.post("/sarvam/tts", async (req, res) => {
  try {
    const key = getSarvamKey();
    const { text, language_code, speaker } = req.body as {
      text: string;
      language_code: string;
      speaker: string;
    };

    if (!text || !language_code || !speaker) {
      res.status(400).json({ error: "text, language_code, and speaker are required" });
      return;
    }

    // Sarvam TTS has a ~500 char limit per input — truncate gracefully
    const truncated = text.slice(0, 500);

    const response = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": key,
      },
      body: JSON.stringify({
        inputs: [truncated],
        target_language_code: language_code,
        speaker,
        model: "bulbul:v3",
        enable_preprocessing: true,
        speech_sample_rate: 22050,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      req.log.error(
        { errText, status: response.status },
        "Sarvam TTS upstream error",
      );
      res.status(502).json({ error: "Text-to-speech failed" });
      return;
    }

    const data = (await response.json()) as {
      audios?: string[];
      audio_content?: string;
    };

    // SDK uses `audios[]`; some older API versions return `audio_content`
    const audioBase64 = data.audios?.[0] ?? data.audio_content;
    if (!audioBase64) {
      req.log.error({ data }, "Sarvam TTS returned no audio");
      res.status(502).json({ error: "No audio in TTS response" });
      return;
    }

    res.json({ audio: audioBase64 });
  } catch (err) {
    req.log.error({ err }, "Sarvam TTS route error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
