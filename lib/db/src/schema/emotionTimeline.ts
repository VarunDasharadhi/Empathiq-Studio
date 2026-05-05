import { pgTable, serial, integer, text, real, timestamp } from "drizzle-orm/pg-core";
import { sessionsTable } from "./sessions.js";

export const emotionTimelineTable = pgTable("emotion_timeline", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessionsTable.id, { onDelete: "cascade" }),
  emotion: text("emotion").notNull(),
  confidence: real("confidence").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmotionSnapshot = typeof emotionTimelineTable.$inferSelect;
export type InsertEmotionSnapshot = typeof emotionTimelineTable.$inferInsert;
