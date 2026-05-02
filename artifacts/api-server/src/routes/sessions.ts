import { Router, type IRouter } from "express";
import { db, sessionsTable, sessionMessagesTable, emotionTimelineTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
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
    res.json(sessions);
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
