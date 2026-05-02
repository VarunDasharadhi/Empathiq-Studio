import { Router, type IRouter } from "express";
import { db, sessionsTable, sessionMessagesTable, emotionTimelineTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

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
    const { title, dominantEmotion } = req.body as {
      title?: string;
      dominantEmotion?: string;
    };

    const [updated] = await db
      .update(sessionsTable)
      .set({
        endedAt: new Date(),
        ...(title ? { title } : {}),
        ...(dominantEmotion ? { dominantEmotion } : {}),
      })
      .where(eq(sessionsTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "End session error");
    res.status(500).json({ error: "Failed to end session" });
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
