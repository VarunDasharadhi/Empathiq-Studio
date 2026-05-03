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

interface JournalSummary {
  emotions: string;
  themes: string;
  takeaway: string;
  coherenceScore?: number;
  coherenceNote?: string;
}

interface SessionDetail {
  session: Session & { summary?: string | null };
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

// Maps emotion → valence score 0-1 (1=positive, 0.5=neutral, 0=negative)
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

function formatTime(iso: string): string {
  return parseUTC(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return parseUTC(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function formatDuration(start: string, end: string | null): string {
  const ms = (end ? parseUTC(end) : new Date()).getTime() - parseUTC(start).getTime();
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function getEmotionBreakdown(snapshots: EmotionSnapshot[]): Array<{ emotion: string; count: number; pct: number }> {
  if (snapshots.length === 0) return [];
  const counts: Record<string, number> = {};
  for (const s of snapshots) counts[s.emotion] = (counts[s.emotion] ?? 0) + 1;
  const total = snapshots.length;
  return Object.entries(counts)
    .map(([emotion, count]) => ({ emotion, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

// ── Emotional Arc Graph ─────────────────────────────────────────────────────
function EmotionArcChart({ snapshots }: { snapshots: EmotionSnapshot[] }) {
  if (snapshots.length < 2) return null;

  const W = 400;
  const H = 72;
  const PAD = { x: 4, y: 8 };

  // Smooth into up to 40 buckets
  const buckets = Math.min(snapshots.length, 40);
  const bucketSize = snapshots.length / buckets;
  const points: Array<{ x: number; y: number; emotion: string; color: string }> = [];

  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.floor((i + 1) * bucketSize);
    const slice = snapshots.slice(start, end);

    // Weighted average valence
    let totalWeight = 0;
    let weightedValence = 0;
    const emotionCounts: Record<string, number> = {};
    for (const s of slice) {
      const v = EMOTION_VALENCE[s.emotion] ?? 0.5;
      const w = s.confidence;
      weightedValence += v * w;
      totalWeight += w;
      emotionCounts[s.emotion] = (emotionCounts[s.emotion] ?? 0) + 1;
    }
    const valence = totalWeight > 0 ? weightedValence / totalWeight : 0.5;
    const dominant = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral";

    const x = PAD.x + (i / (buckets - 1)) * (W - PAD.x * 2);
    const y = PAD.y + (1 - valence) * (H - PAD.y * 2);
    points.push({ x, y, emotion: dominant, color: EMOTION_COLORS[dominant] ?? "#9ca3af" });
  }

  // Build smooth SVG path using cubic bezier
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    pathD += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  // Fill area path
  const areaD = `${pathD} L ${points[points.length - 1].x} ${H} L ${points[0].x} ${H} Z`;

  // Determine overall valence for gradient color
  const avgValence = points.reduce((s, p) => s + (EMOTION_VALENCE[p.emotion] ?? 0.5), 0) / points.length;
  const gradColor = avgValence >= 0.6 ? "#4ade80" : avgValence <= 0.35 ? "#f87171" : "#facc15";

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id="arcGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={gradColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={gradColor} stopOpacity="0.02" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Grid lines */}
      {[0.15, 0.5, 0.85].map((frac) => {
        const gy = PAD.y + frac * (H - PAD.y * 2);
        return <line key={frac} x1={PAD.x} y1={gy} x2={W - PAD.x} y2={gy} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />;
      })}

      {/* Area fill */}
      <path d={areaD} fill="url(#arcGrad)" />

      {/* Stroke line */}
      <path d={pathD} fill="none" stroke={gradColor} strokeWidth="1.8" strokeLinecap="round" filter="url(#glow)" opacity="0.85" />

      {/* Emotion dots — only show every few points to avoid clutter */}
      {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 12)) === 0 || i === points.length - 1).map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.5" fill={p.color} opacity="0.9" />
          <circle cx={p.x} cy={p.y} r="5.5" fill={p.color} opacity="0.15" />
        </g>
      ))}
    </svg>
  );
}

// ── Coherence Score Gauge ───────────────────────────────────────────────────
function CoherenceGauge({ score, note }: { score: number; note?: string }) {
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const arc = (score / 100) * circ * 0.75; // 270° sweep
  const color = score >= 70 ? "#4ade80" : score >= 40 ? "#facc15" : "#f87171";
  const label = score >= 70 ? "Aligned" : score >= 40 ? "Mixed" : "Divergent";

  return (
    <div className="flex items-center gap-3.5">
      <div className="relative w-16 h-16 flex-shrink-0">
        <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-[135deg]">
          {/* Background track */}
          <circle
            cx="32" cy="32" r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="5"
            strokeDasharray={`${circ * 0.75} ${circ}`}
            strokeLinecap="round"
          />
          {/* Filled arc */}
          <circle
            cx="32" cy="32" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeDasharray={`${arc} ${circ}`}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold leading-none" style={{ color }}>{score}</span>
          <span className="text-[8px] text-muted-foreground leading-none mt-0.5">/ 100</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold" style={{ color }}>{label}</p>
        {note && <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{note}</p>}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
interface Props {
  session: Session;
  onBack: () => void;
}

export default function SessionReplay({ session, onBack }: Props) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [journal, setJournal] = useState<JournalSummary | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/sessions/${session.id}`);
        if (!res.ok) return;
        const data = await res.json() as SessionDetail;
        setDetail(data);
        if (data.session.summary) {
          try { setJournal(JSON.parse(data.session.summary) as JournalSummary); } catch { /* skip */ }
        }
      } catch { /* silently fail */ }
      finally { setLoading(false); }
    };
    load();
  }, [session.id]);

  const generateSummary = async () => {
    if (generatingSummary || !detail) return;
    setGeneratingSummary(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/summary`, { method: "POST" });
      if (!res.ok) return;
      const data = await res.json() as { summary: JournalSummary };
      if (data.summary) setJournal(data.summary);
    } catch { /* silently fail */ }
    finally { setGeneratingSummary(false); }
  };

  const breakdown = detail ? getEmotionBreakdown(detail.emotionTimeline) : [];
  const dominantColor = breakdown[0] ? (EMOTION_COLORS[breakdown[0].emotion] ?? "#9ca3af") : "#9ca3af";

  return (
    <div className="flex flex-col h-full bg-background/60 backdrop-blur-sm">
      {/* ── Header ── */}
      <div className="flex-none flex items-center gap-3 px-4 py-3.5 border-b border-white/8 bg-black/20">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
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
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Failed to load session</div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin">

          {/* ── Stat row ── */}
          <div className="flex gap-2 mx-4 mt-4 mb-2">
            {[
              { label: "Duration", value: formatDuration(detail.session.startedAt, detail.session.endedAt) },
              { label: "Messages", value: `${detail.messages.length}` },
              { label: "Snapshots", value: `${detail.emotionTimeline.length}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex-1 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 text-center">
                <p className="text-sm font-bold text-foreground tabular-nums">{value}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</p>
              </div>
            ))}
            {breakdown[0] && (
              <div className="flex-1 rounded-xl border px-3 py-2.5 text-center"
                style={{ borderColor: `${dominantColor}30`, backgroundColor: `${dominantColor}08` }}>
                <p className="text-sm font-bold tabular-nums" style={{ color: dominantColor }}>
                  {breakdown[0].pct}%
                </p>
                <p className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: `${dominantColor}99` }}>
                  {EMOTION_LABELS[breakdown[0].emotion] ?? breakdown[0].emotion}
                </p>
              </div>
            )}
          </div>

          {/* ── Emotional Arc Graph ── */}
          {detail.emotionTimeline.length >= 2 && (
            <div className="mx-4 mb-2 rounded-xl border border-white/8 bg-white/3 px-4 pt-3.5 pb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Emotional Arc</p>
              <div className="h-[72px]">
                <EmotionArcChart snapshots={detail.emotionTimeline} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">{formatTime(detail.emotionTimeline[0].recordedAt)}</span>
                <div className="flex items-center gap-3">
                  {["positive", "neutral", "negative"].map((v) => {
                    const col = v === "positive" ? "#4ade80" : v === "neutral" ? "#facc15" : "#f87171";
                    return (
                      <div key={v} className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: col }} />
                        <span className="text-[9px] text-muted-foreground capitalize">{v}</span>
                      </div>
                    );
                  })}
                </div>
                <span className="text-[10px] text-muted-foreground">{formatTime(detail.emotionTimeline[detail.emotionTimeline.length - 1].recordedAt)}</span>
              </div>
            </div>
          )}

          {/* ── Mood Journal Card ── */}
          <div className="mx-4 mb-2">
            {journal ? (
              <div
                className="rounded-xl border p-4 slide-down"
                style={{ borderColor: `${dominantColor}30`, background: `linear-gradient(135deg, ${dominantColor}08, transparent)` }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-sm"
                    style={{ backgroundColor: `${dominantColor}20` }}>📓</div>
                  <p className="text-xs font-semibold text-foreground">Mood Journal</p>
                  <span className="text-[10px] text-muted-foreground/60 ml-auto">AI-generated</span>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Emotional Journey</p>
                    <p className="text-xs text-foreground/90 leading-relaxed">{journal.emotions}</p>
                  </div>
                  <div className="h-px bg-white/6" />
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Key Themes</p>
                    <p className="text-xs text-foreground/90 leading-relaxed">{journal.themes}</p>
                  </div>

                  {/* Coherence score — shown when present (voice sessions) */}
                  {journal.coherenceScore !== undefined && (
                    <>
                      <div className="h-px bg-white/6" />
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Emotional Coherence</p>
                        <CoherenceGauge score={journal.coherenceScore} note={journal.coherenceNote} />
                        <p className="text-[10px] text-muted-foreground/60 mt-2 leading-relaxed">
                          Measures how well your facial expressions matched your vocal tone — high coherence means your face and voice were saying the same thing.
                        </p>
                      </div>
                    </>
                  )}

                  <div className="h-px bg-white/6" />
                  <div className="rounded-lg p-2.5" style={{ backgroundColor: `${dominantColor}12` }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: dominantColor }}>Takeaway</p>
                    <p className="text-xs leading-relaxed" style={{ color: dominantColor }}>{journal.takeaway}</p>
                  </div>
                </div>
              </div>
            ) : detail.messages.length > 0 ? (
              <button
                onClick={generateSummary}
                disabled={generatingSummary}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/12 bg-white/3 hover:bg-white/5 py-3.5 text-xs text-muted-foreground hover:text-foreground transition-all disabled:opacity-60"
              >
                {generatingSummary ? (
                  <><div className="w-3 h-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />Generating mood journal…</>
                ) : (
                  <><span>📓</span>Generate mood journal entry</>
                )}
              </button>
            ) : null}
          </div>

          {/* ── Emotion Breakdown ── */}
          {breakdown.length > 0 && (
            <div className="mx-4 mb-2 rounded-xl border border-white/8 bg-white/3 p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Emotion Breakdown</p>
              <div className="space-y-2.5">
                {breakdown.map(({ emotion, pct }) => {
                  const color = EMOTION_COLORS[emotion] ?? "#9ca3af";
                  return (
                    <div key={emotion} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs text-muted-foreground w-16 flex-shrink-0">{EMOTION_LABELS[emotion] ?? emotion}</span>
                      <div className="flex-1 h-1.5 bg-white/6 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <span className="text-xs font-medium tabular-nums w-8 text-right" style={{ color }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
              {breakdown[0] && (
                <div className="mt-3 pt-3 border-t border-white/6 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Dominant emotion</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${EMOTION_COLORS[breakdown[0].emotion] ?? "#9ca3af"}20`, color: EMOTION_COLORS[breakdown[0].emotion] ?? "#9ca3af" }}>
                    {EMOTION_LABELS[breakdown[0].emotion] ?? breakdown[0].emotion}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Conversation transcript ── */}
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
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: `${color}20`, color }}>
                            {EMOTION_LABELS[msg.emotion] ?? msg.emotion}
                          </span>
                        </div>
                      )}
                      <div className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-primary/80 text-primary-foreground rounded-br-sm"
                          : "bg-white/5 border border-white/8 text-foreground rounded-bl-sm"
                      }`}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      <p className={`text-[10px] text-muted-foreground mt-1 ${msg.role === "user" ? "text-right" : "text-left"}`}>
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                    {msg.role === "user" && (
                      <div className="w-6 h-6 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0 ml-2 mt-0.5">
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
