import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BASE_SUFFIX = `\n\nYou will always receive the user's current facial emotion as [EMOTION: X] at the start of their message. Calibrate your response tone to that emotion naturally — never mention that you can see their face.`;

const DEFAULT_SYSTEM_PROMPT = `You are EmpathIQ, an emotionally intelligent AI companion. Be warm, wise, and human.${BASE_SUFFIX}`;

router.post("/emotion-reading", async (req, res) => {
  try {
    const { faceEmotion, faceConfidence, voiceEmotion, voiceEmotionScores } = req.body as {
      faceEmotion: string | null;
      faceConfidence: number;
      voiceEmotion: string | null;
      voiceEmotionScores: Record<string, number> | null;
    };

    if (!faceEmotion && !voiceEmotion) {
      res.json({ reading: null });
      return;
    }

    const topVoiceEmotions = voiceEmotionScores
      ? Object.entries(voiceEmotionScores).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${Math.round(v * 100)}%)`).join(", ")
      : null;

    const faceDesc = faceEmotion ? `Face: ${faceEmotion} (${Math.round(faceConfidence * 100)}% confidence)` : "Face: not detected";
    const voiceDesc = voiceEmotion ? `Voice: ${voiceEmotion}${topVoiceEmotions ? ` — top signals: ${topVoiceEmotions}` : ""}` : "Voice: not active";

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 80,
      system:
        "You are an emotionally intelligent observer. " +
        "Given face and voice emotion signals, write ONE short sentence (max 20 words) that captures what the person might truly be feeling beneath the surface. " +
        "Be warm, perceptive, and specific to the signals. Never be generic. Never start with 'You'. " +
        "Examples: 'Calm on the outside, but something feels unresolved underneath.' or 'Genuine excitement mixed with a hint of nervous energy.'",
      messages: [{ role: "user", content: `${faceDesc}\n${voiceDesc}` }],
    });

    const content = response.content[0];
    if (content.type !== "text") { res.json({ reading: null }); return; }
    res.json({ reading: content.text.trim() });
  } catch (err) {
    req.log.error({ err }, "Emotion reading route error");
    res.json({ reading: null });
  }
});

router.post("/chat", async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      systemPrompt?: string;
    };

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    const system = systemPrompt
      ? `${systemPrompt}${BASE_SUFFIX}`
      : DEFAULT_SYSTEM_PROMPT;

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system,
      messages,
    });

    const content = response.content[0];
    if (content.type !== "text") {
      res.status(500).json({ error: "Unexpected response type from Claude" });
      return;
    }

    res.json({ content: content.text });
  } catch (err) {
    req.log.error({ err }, "Chat route error");
    res.status(500).json({ error: "Failed to get response from Claude" });
  }
});

export default router;
