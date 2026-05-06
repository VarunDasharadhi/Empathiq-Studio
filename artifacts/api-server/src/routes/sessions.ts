import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

let nextId = 1;

interface SessionMessage {
  id: number;
  sessionId: number;
  role: string;
  content: string;
  emotion: string | null;
  createdAt: string;
}

interface EmotionSnapshot {
  id: number;
  sessionId: number;
  emotion: string;
  confidence: number;
  recordedAt: string;
}

interface Session {
  id: number;
  title: string;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  dominantEmotion: string | null;
  summary: string | null;
}

const sessions = new Map<number, Session>();
const messages = new Map<number, SessionMessage[]>();
const emotions = new Map<number, EmotionSnapshot[]>();

function makeSession(id: number): Session {
  return {
    id,
    title: "New Session",
    startedAt: new Date().toISOString(),
    endedAt: null,
    messageCount: 0,
    dominantEmotion: null,
    summary: null,
  };
}

router.post("/sessions", (_req, res) => {
  const id = nextId++;
  const session = makeSession(id);
  sessions.set(id, session);
  messages.set(id, []);
  emotions.set(id, []);
  res.json(session);
});

router.get("/sessions", (_req, res) => {
  const all = Array.from(sessions.values()).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  const MAX_SPARKLINE = 20;
  const result = all.map((s) => {
    const full = emotions.get(s.id) ?? [];
    let sampled: Array<{ emotion: string; confidence: number }> = [];
    if (full.length > MAX_SPARKLINE) {
      const step = full.length / MAX_SPARKLINE;
      for (let i = 0; i < MAX_SPARKLINE; i++) {
        sampled.push(full[Math.floor(i * step)]);
      }
    } else {
      sampled = full.map((e) => ({ emotion: e.emotion, confidence: e.confidence }));
    }
    return { ...s, emotionSeries: sampled };
  });

  res.json(result);
});

router.get("/sessions/:id", (req, res) => {
  const id = Number(req.params.id);
  const session = sessions.get(id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({
    session,
    messages: messages.get(id) ?? [],
    emotionTimeline: emotions.get(id) ?? [],
  });
});

router.patch("/sessions/:id", (req, res) => {
  const id = Number(req.params.id);
  const session = sessions.get(id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const { title, dominantEmotion, summary } = req.body as {
    title?: string;
    dominantEmotion?: string;
    summary?: string;
  };
  session.endedAt = new Date().toISOString();
  if (title) session.title = title;
  if (dominantEmotion) session.dominantEmotion = dominantEmotion;
  if (summary) session.summary = summary;
  res.json(session);
});

router.post("/sessions/:id/summary", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const session = sessions.get(id);
    if (!session) {
      res.json({ summary: null });
      return;
    }

    const sessionMessages = messages.get(id) ?? [];
    const emotionTimeline = emotions.get(id) ?? [];

    if (sessionMessages.length === 0) {
      res.json({ summary: null });
      return;
    }

    const emotionCounts: Record<string, number> = {};
    for (const e of emotionTimeline) {
      emotionCounts[e.emotion] = (emotionCounts[e.emotion] ?? 0) + 1;
    }
    const emotionSummary = Object.entries(emotionCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([e, c]) => `${e} (${c}x)`)
      .join(", ");

    const transcript = sessionMessages
      .map((m) => `${m.role.toUpperCase()}${m.emotion ? ` [${m.emotion}]` : ""}: ${m.content}`)
      .join("\n");

    const response = await getAnthropic().messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      system: `You are a compassionate journaling assistant. Given a conversation transcript with detected facial emotions, write a brief mood journal entry. Format your response as JSON with exactly three fields:
- "emotions": a short sentence (max 15 words) describing the emotional journey (e.g. "Started anxious, moved through sadness, ended with calm neutrality")
- "themes": a short sentence (max 20 words) describing 2-3 key themes from the conversation
- "takeaway": one powerful, warm sentence (max 20 words) the person can carry with them

Respond with only valid JSON, no markdown.`,
      messages: [
        {
          role: "user",
          content: `Detected emotions during session: ${emotionSummary || "none detected"}\n\nConversation:\n${transcript}`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    let parsed: { emotions: string; themes: string; takeaway: string } | null = null;
    try {
      parsed = JSON.parse(text) as { emotions: string; themes: string; takeaway: string };
    } catch {
      parsed = { emotions: "Emotional journey recorded.", themes: "Conversation captured.", takeaway: "Every session is a step forward." };
    }

    session.summary = JSON.stringify(parsed);
    res.json({ summary: parsed });
  } catch (err) {
    req.log.error({ err }, "Generate summary error");
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

router.post("/sessions/:id/voice-summary", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const session = sessions.get(id);
    if (!session) {
      res.json({ summary: null });
      return;
    }

    const { voiceEmotionCounts, faceEmotionCounts } = req.body as {
      voiceEmotionCounts: Record<string, number>;
      faceEmotionCounts: Record<string, number>;
    };

    const sessionMessages = messages.get(id) ?? [];

    if (sessionMessages.length === 0) {
      res.json({ summary: null });
      return;
    }

    const transcript = sessionMessages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const faceTop = Object.entries(faceEmotionCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([e, c]) => `${e} (${c}x)`)
      .join(", ") || "none detected";

    const voiceTop = Object.entries(voiceEmotionCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([e, c]) => `${e} (${c}x)`)
      .join(", ") || "none detected";

    const VALENCE: Record<string, string> = {
      happy: "positive", joy: "positive", excited: "positive", amusement: "positive",
      awe: "positive", surprised: "positive", calmness: "positive",
      sad: "negative", angry: "negative", fearful: "negative", disgusted: "negative",
      anxiety: "negative", distress: "negative", pain: "negative", contempt: "negative",
      neutral: "neutral", confusion: "neutral",
    };
    const faceValences = Object.entries(faceEmotionCounts).map(([e]) => VALENCE[e] ?? "neutral");
    const voiceValences = Object.entries(voiceEmotionCounts).map(([e]) => VALENCE[e] ?? "neutral");
    const faceDominantValence = faceValences.length
      ? (faceValences.filter((v) => v === "positive").length > faceValences.length / 2 ? "positive"
        : faceValences.filter((v) => v === "negative").length > faceValences.length / 2 ? "negative" : "neutral")
      : "neutral";
    const voiceDominantValence = voiceValences.length
      ? (voiceValences.filter((v) => v === "positive").length > voiceValences.length / 2 ? "positive"
        : voiceValences.filter((v) => v === "negative").length > voiceValences.length / 2 ? "negative" : "neutral")
      : "neutral";
    const valencesMatch = faceDominantValence === voiceDominantValence;

    const response = await getAnthropic().messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 400,
      system: `You are EmpathIQ's session analyst. Given a voice conversation transcript plus facial and vocal emotion data, produce a rich session summary as JSON with exactly these fields:
- "emotions": one sentence (≤18 words) describing the user's emotional arc across the session (use past tense, e.g. "Opened with anxiety, softened into reflection, closed with quiet resolve")
- "themes": one sentence (≤20 words) identifying 2–3 key topics or themes from the conversation
- "coherenceScore": integer 0–100 representing emotional coherence — how well face expressions matched vocal emotions (high = aligned, low = masked/dissociated). Base it on the valence alignment data provided
- "coherenceNote": one short phrase (≤10 words) interpreting the score (e.g. "Face and voice in strong agreement", "Some emotional masking detected", "Mixed signals — complex emotional state")
- "takeaway": one powerful, warm sentence (≤22 words) the person can carry with them after this session

Respond with ONLY valid JSON, no markdown.`,
      messages: [
        {
          role: "user",
          content: `Facial emotions detected: ${faceTop}\nVocal emotions detected: ${voiceTop}\nFace dominant valence: ${faceDominantValence}\nVoice dominant valence: ${voiceDominantValence}\nValences match: ${valencesMatch}\n\nTranscript:\n${transcript}`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    let parsed: {
      emotions: string; themes: string;
      coherenceScore: number; coherenceNote: string; takeaway: string;
    } | null = null;
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      parsed = {
        emotions: "Emotional journey recorded.",
        themes: "Meaningful conversation captured.",
        coherenceScore: valencesMatch ? 75 : 40,
        coherenceNote: valencesMatch ? "Face and voice aligned" : "Some emotional complexity detected",
        takeaway: "Every conversation is a step toward greater self-awareness.",
      };
    }

    session.summary = JSON.stringify(parsed);
    res.json({ summary: parsed });
  } catch (err) {
    req.log.error({ err }, "Voice summary error");
    res.status(500).json({ error: "Failed to generate voice summary" });
  }
});

router.post("/sessions/:id/messages", (req, res) => {
  const sessionId = Number(req.params.id);
  const session = sessions.get(sessionId);
  const { role, content, emotion } = req.body as {
    role: "user" | "assistant";
    content: string;
    emotion?: string;
  };

  if (!session) {
    res.json({ id: 0, sessionId, role, content, emotion: emotion ?? null, createdAt: new Date().toISOString() });
    return;
  }

  // Reset startedAt to the first real message so duration reflects
  // conversation time, not idle time since page load
  if (session.messageCount === 0) {
    session.startedAt = new Date().toISOString();
  }

  const msg: SessionMessage = {
    id: nextId++,
    sessionId,
    role,
    content,
    emotion: emotion ?? null,
    createdAt: new Date().toISOString(),
  };
  (messages.get(sessionId) ?? []).push(msg);
  session.messageCount += 1;
  res.json(msg);
});

router.post("/sessions/:id/emotions", (req, res) => {
  const sessionId = Number(req.params.id);
  const { emotion, confidence } = req.body as { emotion: string; confidence: number };

  const snapshot: EmotionSnapshot = {
    id: nextId++,
    sessionId,
    emotion,
    confidence,
    recordedAt: new Date().toISOString(),
  };

  const list = emotions.get(sessionId);
  if (list) list.push(snapshot);

  res.json(snapshot);
});

export default router;
