import { Router, type IRouter } from "express";
import { db, sessionsTable, sessionMessagesTable, emotionTimelineTable } from "@workspace/db";
import { eq, desc, sql, inArray } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.post("/sessions", async (req, res) => {
  try {
    const [session] = await db
      .insert(sessionsTable)
      .values({ title: "New Session" })
      .returning();
    res.json(session);
  } catch (err) {
    req.log.error({ err }, "Create session error");
    res.status(500).json({ error: "Failed to create session" });
  }
});

router.get("/sessions", async (req, res) => {
  try {
    const sessions = await db
      .select()
      .from(sessionsTable)
      .orderBy(desc(sessionsTable.startedAt))
      .limit(50);

    if (sessions.length === 0) {
      res.json([]);
      return;
    }

    const sessionIds = sessions.map((s) => s.id);
    const allEmotions = await db
      .select({
        sessionId: emotionTimelineTable.sessionId,
        emotion: emotionTimelineTable.emotion,
        confidence: emotionTimelineTable.confidence,
      })
      .from(emotionTimelineTable)
      .where(inArray(emotionTimelineTable.sessionId, sessionIds))
      .orderBy(emotionTimelineTable.recordedAt);

    const emotionsBySession: Record<number, Array<{ emotion: string; confidence: number }>> = {};
    for (const e of allEmotions) {
      if (!emotionsBySession[e.sessionId]) emotionsBySession[e.sessionId] = [];
      emotionsBySession[e.sessionId].push({ emotion: e.emotion, confidence: e.confidence });
    }

    const MAX_SPARKLINE = 20;
    const result = sessions.map((s) => {
      const full = emotionsBySession[s.id] ?? [];
      let sampled: Array<{ emotion: string; confidence: number }> = [];
      if (full.length > MAX_SPARKLINE) {
        const step = full.length / MAX_SPARKLINE;
        for (let i = 0; i < MAX_SPARKLINE; i++) {
          sampled.push(full[Math.floor(i * step)]);
        }
      } else {
        sampled = full;
      }
      return { ...s, emotionSeries: sampled };
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List sessions error");
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

router.get("/sessions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, id));

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const messages = await db
      .select()
      .from(sessionMessagesTable)
      .where(eq(sessionMessagesTable.sessionId, id))
      .orderBy(sessionMessagesTable.createdAt);

    const emotionTimeline = await db
      .select()
      .from(emotionTimelineTable)
      .where(eq(emotionTimelineTable.sessionId, id))
      .orderBy(emotionTimelineTable.recordedAt);

    res.json({ session, messages, emotionTimeline });
  } catch (err) {
    req.log.error({ err }, "Get session error");
    res.status(500).json({ error: "Failed to get session" });
  }
});

router.patch("/sessions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, dominantEmotion, summary } = req.body as {
      title?: string;
      dominantEmotion?: string;
      summary?: string;
    };

    const [updated] = await db
      .update(sessionsTable)
      .set({
        endedAt: new Date(),
        ...(title ? { title } : {}),
        ...(dominantEmotion ? { dominantEmotion } : {}),
        ...(summary ? { summary } : {}),
      })
      .where(eq(sessionsTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "End session error");
    res.status(500).json({ error: "Failed to end session" });
  }
});

router.post("/sessions/:id/summary", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const messages = await db
      .select()
      .from(sessionMessagesTable)
      .where(eq(sessionMessagesTable.sessionId, id))
      .orderBy(sessionMessagesTable.createdAt);

    const emotionTimeline = await db
      .select()
      .from(emotionTimelineTable)
      .where(eq(emotionTimelineTable.sessionId, id))
      .orderBy(emotionTimelineTable.recordedAt);

    if (messages.length === 0) {
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

    const transcript = messages
      .map((m) => `${m.role.toUpperCase()}${m.emotion ? ` [${m.emotion}]` : ""}: ${m.content}`)
      .join("\n");

    const response = await anthropic.messages.create({
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

    const summaryJson = JSON.stringify(parsed);

    await db
      .update(sessionsTable)
      .set({ summary: summaryJson })
      .where(eq(sessionsTable.id, id));

    res.json({ summary: parsed });
  } catch (err) {
    req.log.error({ err }, "Generate summary error");
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

router.post("/sessions/:id/voice-summary", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { voiceEmotionCounts, faceEmotionCounts } = req.body as {
      voiceEmotionCounts: Record<string, number>;
      faceEmotionCounts: Record<string, number>;
    };

    const messages = await db
      .select()
      .from(sessionMessagesTable)
      .where(eq(sessionMessagesTable.sessionId, id))
      .orderBy(sessionMessagesTable.createdAt);

    if (messages.length === 0) {
      res.json({ summary: null });
      return;
    }

    const transcript = messages
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

    const response = await anthropic.messages.create({
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

    const summaryJson = JSON.stringify(parsed);
    await db.update(sessionsTable).set({ summary: summaryJson }).where(eq(sessionsTable.id, id));

    res.json({ summary: parsed });
  } catch (err) {
    req.log.error({ err }, "Voice summary error");
    res.status(500).json({ error: "Failed to generate voice summary" });
  }
});

router.post("/sessions/:id/messages", async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const { role, content, emotion } = req.body as {
      role: "user" | "assistant";
      content: string;
      emotion?: string;
    };

    const [message] = await db
      .insert(sessionMessagesTable)
      .values({ sessionId, role, content, emotion: emotion ?? null })
      .returning();

    await db
      .update(sessionsTable)
      .set({ messageCount: sql`${sessionsTable.messageCount} + 1` })
      .where(eq(sessionsTable.id, sessionId));

    res.json(message);
  } catch (err) {
    req.log.error({ err }, "Add message error");
    res.status(500).json({ error: "Failed to add message" });
  }
});

router.post("/sessions/:id/emotions", async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const { emotion, confidence } = req.body as {
      emotion: string;
      confidence: number;
    };

    const [snapshot] = await db
      .insert(emotionTimelineTable)
      .values({ sessionId, emotion, confidence })
      .returning();

    res.json(snapshot);
  } catch (err) {
    req.log.error({ err }, "Record emotion error");
    res.status(500).json({ error: "Failed to record emotion" });
  }
});

export default router;
