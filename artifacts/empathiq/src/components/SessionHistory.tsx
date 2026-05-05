import { useEffect, useState } from "react";

export interface Session {
  id: number;
  title: string;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  dominantEmotion: string | null;
  emotionSeries?: Array<{ emotion: string; confidence: number }>;
}

const EMOTION_COLORS: Record<string, string> = {
  happy: "#facc15",
  sad: "#60a5fa",
  angry: "#f87171",
  fearful: "#c084fc",
  disgusted: "#4ade80",
  surprised: "#fb923c",
  neutral: "#9ca3af",
};

const EMOTION_LABELS: Record<string, string> = {
  happy: "Happy", sad: "Sad", angry: "Angry",
  fearful: "Fearful", disgusted: "Disgusted",
  surprised: "Surprised", neutral: "Neutral",
};

const EMOTION_VALENCE: Record<string, number> = {
  happy: 0.92, joy: 0.92, excited: 0.88, amusement: 0.82, awe: 0.78, surprised: 0.7,
  neutral: 0.5, calmness: 0.55, confusion: 0.42,
  fearful: 0.22, anxious: 0.2, sad: 0.18, disgusted: 0.14, angry: 0.1, pain: 0.08,
};

// PostgreSQL returns timestamps without timezone — treat them as UTC
function parseUTC(ts: string): Date {
  if (/[Zz]$/.test(ts) || /[+-]\d{2}:\d{2}$/.test(ts)) return new Date(ts);
  return new Date(ts.replace(" ", "T") + "Z");
}

function formatDuration(start: string, end: string | null): string {
  const ms = (end ? parseUTC(end) : new Date()).getTime() - parseUTC(start).getTime();
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatDate(iso: string): string {
  const d = parseUTC(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Mini Sparkline ───────────────────────────────────────────────────────────
function MiniSparkline({
  series,
  dominantEmotion,
  sessionId,
}: {
  series: Array<{ emotion: string; confidence: number }>;
  dominantEmotion: string | null;
  sessionId: number;
}) {
  if (series.length < 2) return null;

  const W = 80;
  const H = 24;
  const PAD = { x: 2, y: 3 };

  const points: Array<{ x: number; y: number }> = series.map((snap, i) => {
    const valence = EMOTION_VALENCE[snap.emotion] ?? 0.5;
    const x = PAD.x + (i / (series.length - 1)) * (W - PAD.x * 2);
    const y = PAD.y + (1 - valence) * (H - PAD.y * 2);
    return { x, y };
  });

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    pathD += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  const areaD = `${pathD} L ${points[points.length - 1].x} ${H} L ${points[0].x} ${H} Z`;

  const avgValence =
    series.reduce((sum, s) => sum + (EMOTION_VALENCE[s.emotion] ?? 0.5), 0) / series.length;
  const baseColor =
    dominantEmotion ? (EMOTION_COLORS[dominantEmotion] ?? "#9ca3af") : "#9ca3af";
  const lineColor = avgValence >= 0.6 ? "#4ade80" : avgValence <= 0.35 ? "#f87171" : baseColor;

  const gradId = `sg-${sessionId}`;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="overflow-visible flex-shrink-0"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path
        d={pathD}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.9"
      />
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="2"
        fill={lineColor}
        opacity="0.9"
      />
    </svg>
  );
}

interface Props {
  currentSessionId: number | null;
  onSelectSession: (session: Session) => void;
  onNewSession: () => void;
}

export default function SessionHistory({ currentSessionId, onSelectSession, onNewSession }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) return;
      const data = await res.json() as Session[];
      setSessions(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-4 py-3.5 border-b border-border bg-card">
        <div>
          <p className="text-sm font-semibold text-foreground">Session History</p>
          <p className="text-xs text-muted-foreground mt-0.5">{sessions.length} saved session{sessions.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={onNewSession}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
            <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <span className="text-xs">Loading sessions…</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-6">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-muted-foreground">
                <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No past sessions</p>
              <p className="text-xs text-muted-foreground mt-1">Your conversations will appear here after each session ends</p>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {sessions.map((session) => {
              const isCurrent = session.id === currentSessionId;
              const color = session.dominantEmotion ? EMOTION_COLORS[session.dominantEmotion] : null;
              const hasSeries = session.emotionSeries && session.emotionSeries.length >= 2;

              return (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session)}
                  className={`w-full text-left rounded-xl p-3.5 border transition-all group ${
                    isCurrent
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card hover:border-border/80 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {isCurrent && (
                          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-foreground truncate">
                          {session.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(session.startedAt)}
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDuration(session.startedAt, session.endedAt)}
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-[11px] text-muted-foreground">
                          {session.messageCount} msg{session.messageCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end gap-2">
                      {color && session.dominantEmotion ? (
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${color}20`, color }}
                        >
                          {EMOTION_LABELS[session.dominantEmotion]}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/60 px-2 py-0.5 rounded-full bg-muted">
                          —
                        </span>
                      )}
                      {hasSeries && (
                        <MiniSparkline
                          series={session.emotionSeries!}
                          dominantEmotion={session.dominantEmotion}
                          sessionId={session.id}
                        />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
