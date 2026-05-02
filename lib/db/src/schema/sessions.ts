import { pgTable, serial, text, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("New Session"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  messageCount: integer("message_count").notNull().default(0),
  dominantEmotion: text("dominant_emotion"),
});

export const sessionMessagesTable = pgTable("session_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessionsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  emotion: text("emotion"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const emotionTimelineTable = pgTable("emotion_timeline", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessionsTable.id, { onDelete: "cascade" }),
  emotion: text("emotion").notNull(),
  confidence: real("confidence").notNull(),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true, startedAt: true, messageCount: true });
export const insertMessageSchema = createInsertSchema(sessionMessagesTable).omit({ id: true, createdAt: true });
export const insertEmotionSchema = createInsertSchema(emotionTimelineTable).omit({ id: true, recordedAt: true });

export type Session = typeof sessionsTable.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type SessionMessage = typeof sessionMessagesTable.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type EmotionSnapshot = typeof emotionTimelineTable.$inferSelect;
