import { useEffect, useState } from "react";
import type { Session } from "./SessionHistory";

interface Message {
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

interface SessionDetail {
  session: Session;
  messages: Message[];
  emotionTimeline: EmotionSnapshot[];
}

const EMOTION_COLORS: Record<string, string> = {
  happy: "#facc15", sad: "#60a5fa", angry: "#f87171",
  fearful: "#c084fc", disgusted: "#4ade80",
  surprised: "#fb923c", neutral: "#9ca3af",
};

const EMOTION_LABELS: Record<string, string> = {
  happy: "Happy", sad: "Sad", angry: "Angry",
  fearful: "Fearful", disgusted: "Disgusted",
  surprised: "Surprised", neutral: "Neutral",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
}

function getEmotionBreakdown(snapshots: EmotionSnapshot[]): Array<{ emotion: string; count: number; pct: number }> {
  if (snapshots.length === 0) return [];
  const counts: Record<string, number> = {};
  for (const s of snapshots) {
    counts[s.emotion] = (counts[s.emotion] ?? 0) + 1;
  }
  const total = snapshots.length;
  return Object.entries(counts)
    .map(([emotion, count]) => ({ emotion, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

interface Props {
  session: Session;
  onBack: () => void;
}

export default function SessionReplay({ session, onBack }: Props) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/sessions/${session.id}`);
        if (!res.ok) return;
        const data = await res.json() as SessionDetail;
        setDetail(data);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [session.id]);

  const breakdown = detail ? getEmotionBreakdown(detail.emotionTimeline) : [];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex-none flex items-center gap-3 px-4 py-3.5 border-b border-border bg-card">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{session.title}</p>
          <p className="text-xs text-muted-foreground">{formatDate(session.startedAt)}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      ) : !detail ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Failed to load session
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Emotion breakdown chart */}
          {breakdown.length > 0 && (
            <div className="mx-4 mt-4 mb-2 rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Emotion Breakdown
              </p>
              <div className="space-y-2.5">
                {breakdown.map(({ emotion, pct }) => {
                  const color = EMOTION_COLORS[emotion] ?? "#9ca3af";
                  return (
                    <div key={emotion} className="flex items-center gap-3">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs text-muted-foreground w-16 flex-shrink-0">
                        {EMOTION_LABELS[emotion] ?? emotion}
                      </span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="text-xs font-medium tabular-nums w-8 text-right" style={{ color }}>
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Dominant emotion summary */}
              {breakdown[0] && (
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Dominant emotion</span>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${EMOTION_COLORS[breakdown[0].emotion] ?? "#9ca3af"}20`,
                      color: EMOTION_COLORS[breakdown[0].emotion] ?? "#9ca3af",
                    }}
                  >
                    {EMOTION_LABELS[breakdown[0].emotion] ?? breakdown[0].emotion}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Emotion timeline strip */}
          {detail.emotionTimeline.length > 0 && (
            <div className="mx-4 mb-2 rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Emotion Timeline
              </p>
              <div className="flex gap-0.5 h-6 rounded overflow-hidden">
                {detail.emotionTimeline.map((snap) => {
                  const color = EMOTION_COLORS[snap.emotion] ?? "#9ca3af";
                  return (
                    <div
                      key={snap.id}
                      className="flex-1 min-w-[2px] rounded-sm transition-opacity hover:opacity-80 cursor-default"
                      style={{ backgroundColor: color, opacity: 0.6 + snap.confidence * 0.4 }}
                      title={`${EMOTION_LABELS[snap.emotion] ?? snap.emotion} (${Math.round(snap.confidence * 100)}%) at ${formatTime(snap.recordedAt)}`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-muted-foreground">
                  {formatTime(detail.emotionTimeline[0]?.recordedAt ?? detail.session.startedAt)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatTime(
                    detail.emotionTimeline[detail.emotionTimeline.length - 1]?.recordedAt ??
                    detail.session.endedAt ??
                    detail.session.startedAt
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Messages replay */}
          <div className="px-4 pb-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2 mb-1">
              Conversation ({detail.messages.length} messages)
            </p>

            {detail.messages.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">No messages in this session</div>
            ) : (
              detail.messages.map((msg) => {
                const color = msg.emotion ? EMOTION_COLORS[msg.emotion] : null;
                return (
                  <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-primary">
                          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
                        </svg>
                      </div>
                    )}
                    <div className="max-w-[82%]">
                      {msg.role === "user" && color && msg.emotion && (
                        <div className="flex justify-end mb-1">
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: `${color}20`, color }}
                          >
                            {EMOTION_LABELS[msg.emotion] ?? msg.emotion}
                          </span>
                        </div>
                      )}
                      <div
                        className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                          msg.role === "user"
                            ? "bg-primary/80 text-primary-foreground rounded-br-sm"
                            : "bg-card border border-border text-foreground rounded-bl-sm"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      <p className={`text-[10px] text-muted-foreground mt-1 ${msg.role === "user" ? "text-right" : "text-left"}`}>
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                    {msg.role === "user" && (
                      <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 ml-2 mt-0.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-muted-foreground">
                          <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
