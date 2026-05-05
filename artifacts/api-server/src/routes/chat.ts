import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BASE_SUFFIX = `\n\nYou will always receive the user's current facial emotion as [EMOTION: X] at the start of their message. Calibrate your response tone to that emotion naturally — never mention that you can see their face.`;

const DEFAULT_SYSTEM_PROMPT = `You are EmpathIQ, an emotionally intelligent AI companion. Be warm, wise, and human.${BASE_SUFFIX}`;

router.post("/proactive-checkin", async (req, res) => {
  try {
    const { emotion, durationSeconds } = req.body as {
      emotion: string;
      durationSeconds: number;
    };

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 60,
      system:
        "You are a warm, perceptive AI companion. " +
        "The user has been showing signs of distress for a while. " +
        "Write ONE very short, casual check-in message (max 15 words). " +
        "Never start with 'I understand', 'That\\'s completely valid', 'It sounds like', or 'I'. " +
        "Use natural, human language. No emojis. " +
        "Examples: 'Something feels heavy right now, want to talk about it?' or 'You\\'ve been carrying something for a bit, I\\'m here.' or 'Hey, you okay? Your face has been saying a lot.'",
      messages: [
        {
          role: "user",
          content: `The user has shown ${emotion} emotion for about ${durationSeconds} seconds. Write a gentle casual check-in.`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") { res.json({ message: null }); return; }
    res.json({ message: content.text.trim() });
  } catch (err) {
    req.log.error({ err }, "Proactive checkin route error");
    res.json({ message: null });
  }
});

router.post("/glasses-coaching", async (req, res) => {
  try {
    const { emotion, confidence } = req.body as { emotion: string; confidence: number };

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 50,
      system:
        "You are a real-time conversation coach whispering tips to the user via a HUD overlay. " +
        "The user's camera is facing OUTWARD — you are reading the OTHER person's face. " +
        "Give ONE ultra-short, actionable coaching tip based on that person's emotional state. " +
        "Max 12 words. No emojis. No 'they' or pronouns — address the user directly with what to DO. " +
        "Examples: 'Slow down — give them room to respond.' or 'They're open. Land your key point now.' or 'Ease the tension — try a light, warm remark.'",
      messages: [
        {
          role: "user",
          content: `The person I'm talking to appears ${emotion} (confidence ${Math.round(confidence * 100)}%). What should I do right now?`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") { res.json({ coaching: null }); return; }
    res.json({ coaching: content.text.trim() });
  } catch (err) {
    req.log.error({ err }, "Glasses coaching route error");
    res.json({ coaching: null });
  }
});

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
