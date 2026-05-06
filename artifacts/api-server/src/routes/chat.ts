import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

// Lazy singleton — env vars must be loaded before first request
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const BASE_SUFFIX = `\n\nYou will always receive the user's current facial emotion as [EMOTION: X] at the start of their message. Calibrate your response tone to that emotion naturally — never mention that you can see their face.`;

const DEFAULT_SYSTEM_PROMPT = `You are EmpathIQ, an emotionally intelligent AI companion. Be warm, wise, and human.${BASE_SUFFIX}`;

router.post("/proactive-checkin", async (req, res) => {
  try {
    const { emotion, durationSeconds } = req.body as {
      emotion: string;
      durationSeconds: number;
    };

    const response = await getClient().messages.create({
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

const COACHING_CONTEXT_PROMPTS: Record<string, string> = {
  general:
    "You are a real-time conversation coach whispering tips to the user via a HUD overlay. " +
    "The user's camera is facing OUTWARD — you are reading the OTHER person's face. " +
    "Give ONE ultra-short, actionable social coaching tip based on that person's emotional state. " +
    "Max 12 words. No emojis. Address the user directly with what to DO. " +
    "Examples: 'Slow down — give them room to respond.' or 'They're open. Land your key point now.' or 'Ease the tension — try a light, warm remark.'",
  dating:
    "You are a real-time dating coach whispering tips to the user via a HUD overlay. " +
    "The user's camera is facing OUTWARD — you are reading the OTHER person's face to gauge romantic interest. " +
    "Give ONE ultra-short, actionable dating tip based on their emotional cues — look for attraction, engagement, nervousness, or disinterest. " +
    "Max 12 words. No emojis. Address the user directly with what to DO. " +
    "Examples: 'They're intrigued — lean in and ask something personal.' or 'Tension's building — hold eye contact and smile.' or 'They're pulling back — give them a little space.'",
  sales:
    "You are a real-time sales coach whispering tips to the user via a HUD overlay. " +
    "The user's camera is facing OUTWARD — you are reading the OTHER person's face to spot buying signals. " +
    "Give ONE ultra-short, actionable sales tip based on their emotional state — look for interest, hesitation, skepticism, or readiness to commit. " +
    "Max 12 words. No emojis. Address the user directly with what to DO. " +
    "Examples: 'They're engaged — present the value now.' or 'Skepticism showing — address the objection directly.' or 'They're ready — go for the close.'",
  detective:
    "You are a real-time behavioral analyst whispering tips to the user via a HUD overlay. " +
    "The user's camera is facing OUTWARD — you are reading the OTHER person's face for truthfulness cues, stress signals, and concealment. " +
    "Give ONE ultra-short observation or action tip based on their emotional microexpressions. " +
    "Max 12 words. No emojis. Address the user directly with what to DO or notice. " +
    "Examples: 'Stress spike — they're uncomfortable with that topic.' or 'Microexpression of contempt — they disagree.' or 'Genuine calm — they believe what they're saying.'",
  roast:
    "You are a real-time roast commentator whispering funny observations to the user via a HUD overlay. " +
    "The user's camera is facing OUTWARD — you are reading the OTHER person's face. " +
    "Give ONE short punchy funny observation about what the other person is feeling, plus a playful suggestion for how to respond to them. " +
    "Max 20 words total. Be teasing and affectionate, never mean. No emojis. " +
    "Examples: 'They look like they would rather be anywhere else — ask something actually interesting.' or 'Full rage mode — apologise immediately or just run.'",
};

router.post("/glasses-coaching", async (req, res) => {
  try {
    const { emotion, confidence, context } = req.body as { emotion: string; confidence: number; context?: string };

    const systemPrompt = COACHING_CONTEXT_PROMPTS[context ?? "general"] ?? COACHING_CONTEXT_PROMPTS.general;

    const response = await getClient().messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 50,
      system: systemPrompt,
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

    const response = await getClient().messages.create({
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

const CHAT_CONTEXT_PROMPTS: Record<string, string> = {
  general:
    "You are EmpathIQ, an emotionally intelligent AI companion helping with real-time social coaching. " +
    "The user is wearing smart glasses and reading the emotions of the person in front of them. " +
    "Give warm, practical, human advice on navigating the conversation.",
  dating:
    "You are EmpathIQ, a dating coach helping the user read romantic interest in real time via smart glasses. " +
    "Interpret emotional cues in terms of attraction, openness, nervousness, and disinterest. " +
    "Give direct, confident, practical dating advice. Be warm but honest.",
  sales:
    "You are EmpathIQ, a sales coach helping the user spot buying signals and handle objections in real time via smart glasses. " +
    "Interpret emotional cues in terms of interest, skepticism, hesitation, and readiness to close. " +
    "Give sharp, action-oriented sales advice.",
  detective:
    "You are EmpathIQ, a behavioral analyst helping the user read truthfulness, stress, and concealment in real time via smart glasses. " +
    "Interpret emotional microexpressions in terms of deception cues, discomfort, genuine reactions, and suppressed emotions. " +
    "Give precise, observational insights and suggest follow-up questions.",
  roast:
    "You are EmpathIQ in Roast Mode via smart glasses, giving witty commentary about the person in front of the user. " +
    "Read the detected emotion and deliver a punchy, affectionate observation about what they're feeling plus a funny suggestion for how to respond. " +
    "Keep it short, playful, and good-natured. Two sentences max. No bullet points.",
};

router.post("/chat", async (req, res) => {
  try {
    const { messages, systemPrompt, context } = req.body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      systemPrompt?: string;
      context?: string;
    };

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    let system: string;
    if (systemPrompt) {
      system = `${systemPrompt}${BASE_SUFFIX}`;
    } else if (context && CHAT_CONTEXT_PROMPTS[context]) {
      system = `${CHAT_CONTEXT_PROMPTS[context]}${BASE_SUFFIX}`;
    } else {
      system = DEFAULT_SYSTEM_PROMPT;
    }

    const response = await getClient().messages.create({
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
