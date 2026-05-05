import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { sessionsTable } from "./sessions.js";

export const sessionMessagesTable = pgTable("session_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessionsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  emotion: text("emotion"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SessionMessage = typeof sessionMessagesTable.$inferSelect;
export type InsertSessionMessage = typeof sessionMessagesTable.$inferInsert;
