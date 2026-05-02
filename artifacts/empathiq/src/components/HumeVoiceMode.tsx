import { useEffect, useRef, useState, useCallback } from "react";
import { VoiceProvider, useVoice, type JSONMessage } from "@humeai/voice-react";

// ── Types ──────────────────────────────────────────────────────────────────
interface TranscriptEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  emotions?: Record<string, number>;
  receivedAt: Date;
}

interface Props {
  onVoiceEmotion: (emotion: string | null, scores: Record<string, number> | null) => void;
  sessionId: number | null;
}

// ── Emotion helpers ────────────────────────────────────────────────────────
const EMOTION_COLORS: Record<string, string> = {
  happy: "#facc15", sad: "#60a5fa", angry: "#f87171",
  fearful: "#c084fc", disgusted: "#4ade80",
  surprised: "#fb923c", neutral: "#9ca3af", excited: "#fb923c",
  contempt: "#f87171", anxiety: "#c084fc", joy: "#facc15",
  distress: "#60a5fa", pain: "#f87171", awe: "#67e8f9",
  amusement: "#facc15", confusion: "#9ca3af", calmness: "#4ade80",
};

function getEmotionColor(emotion: string): string {
  const lower = emotion.toLowerCase();
  return EMOTION_COLORS[lower] ?? "#9ca3af";
}

function getDominantEmotion(scores: Record<string, number>): { label: string; score: number } {
  const entries = Object.entries(scores);
  if (entries.length === 0) return { label: "neutral", score: 0 };
  const [label, score] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  return { label, score };
}

// ── Mic visualizer bars (uses fft from useVoice) ───────────────────────────
function FftVisualizer({ fft, color, isActive }: { fft: number[]; color: string; isActive: boolean }) {
  const bars = 20;
  const step = Math.floor(fft.length / bars) || 1;
  return (
    <div className="flex items-center justify-center gap-[3px] h-12 px-4">
      {Array.from({ length: bars }).map((_, i) => {
        const raw = fft[i * step] ?? 0;
        const h = isActive ? Math.max(4, Math.round(raw * 40)) : 3;
        return (
          <div
            key={i}
            className="w-[4px] rounded-full transition-all"
            style={{
              height: `${h}px`,
              backgroundColor: color,
              opacity: isActive ? 0.7 + raw * 0.3 : 0.2,
              transitionDuration: isActive ? "80ms" : "400ms",
            }}
          />
        );
      })}
    </div>
  );
}

// ── Top-N emotion chips from prosody scores ───────────────────────────────
function EmotionChips({ scores }: { scores: Record<string, number> }) {
  const top = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {top.map(([label, score]) => {
        const color = getEmotionColor(label);
        return (
          <span
            key={label}
            className="text-[9px] font-medium px-1.5 py-0.5 rounded-full capitalize"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {label} {Math.round(score * 100)}%
          </span>
        );
      })}
    </div>
  );
}

// ── Inner component — must be child of VoiceProvider ──────────────────────
function VoiceModeInner({ apiKey, onVoiceEmotion, sessionId }: {
  apiKey: string;
  onVoiceEmotion: (emotion: string | null, scores: Record<string, number> | null) => void;
  sessionId: number | null;
}) {
  const { connect, disconnect, readyState, messages, fft, isPlaying } = useVoice();
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const connectedRef = useRef(false);

  // Auto-connect on mount
  useEffect(() => {
    if (connectedRef.current) return;
    connectedRef.current = true;
    connect({
      auth: { type: "apiKey", value: apiKey },
      audioConstraints: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setError(msg);
    });
    return () => { disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Parse new messages into transcript entries + extract voice emotion
  useEffect(() => {
    const jsonMessages = messages.filter(
      (m): m is JSONMessage => !("code" in m) && m.type !== "socket_connected" && m.type !== "socket_disconnected" && m.type !== "session_settings"
    );

    const entries: TranscriptEntry[] = [];
    for (const m of jsonMessages) {
      const type = (m as { type?: string }).type;

      if (type === "user_message") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const um = m as any;
        const content: string = um.message?.content ?? "";
        if (!content.trim()) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const scores: Record<string, number> = um.models?.prosody?.scores ?? {};
        entries.push({
          id: `u-${um.receivedAt?.toISOString() ?? Math.random()}`,
          role: "user",
          content,
          emotions: Object.keys(scores).length > 0 ? scores : undefined,
          receivedAt: um.receivedAt ?? new Date(),
        });
        if (Object.keys(scores).length > 0) {
          const dom = getDominantEmotion(scores);
          onVoiceEmotion(dom.label, scores);
        }
      } else if (type === "assistant_message") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const am = m as any;
        const content: string = am.message?.content ?? "";
        if (!content.trim()) continue;
        entries.push({
          id: `a-${am.receivedAt?.toISOString() ?? Math.random()}`,
          role: "assistant",
          content,
          receivedAt: am.receivedAt ?? new Date(),
        });
      }
    }

    setTranscript(entries);
  }, [messages, onVoiceEmotion]);

  // Save messages to session on unmount / when transcript changes
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (!sessionId || transcript.length === 0) return;
    const newEntries = transcript.slice(prevLenRef.current);
    prevLenRef.current = transcript.length;
    for (const entry of newEntries) {
      fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: entry.role, content: entry.content, emotion: null }),
      }).catch(() => {});
    }
  }, [transcript, sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const isConnected = readyState === 1; // OPEN
  const isConnecting = readyState === 0;
  const isDisconnected = readyState === 3 || readyState === 2;

  const fftIsActive = fft.some((v) => v > 0.01);
  const visualColor = isPlaying ? "#22d3ee" : "#818cf8";

  return (
    <div className="flex flex-col h-full bg-background/60 backdrop-blur-sm">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-5 py-3.5 border-b border-white/8 bg-black/20">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="text-base">🎙</span>
            Hume Voice Mode
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">EVI — Empathic Voice Interface</p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/12 border border-green-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-green-400 font-medium">Connected</span>
            </div>
          )}
          {isConnecting && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/12 border border-amber-500/20">
              <div className="w-3 h-3 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
              <span className="text-[10px] text-amber-400 font-medium">Connecting…</span>
            </div>
          )}
          {isDisconnected && !error && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium">Disconnected</span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/12 border border-red-500/20">
              <span className="text-[10px] text-red-400 font-medium">Error</span>
            </div>
          )}
        </div>
      </div>

      {/* Visualizer */}
      {isConnected && (
        <div className="flex-none border-b border-white/6 bg-black/10">
          <div className="flex flex-col items-center py-2">
            <FftVisualizer fft={fft} color={visualColor} isActive={fftIsActive || isPlaying} />
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              {isPlaying ? "EVI is speaking…" : fftIsActive ? "Listening…" : "Speak naturally — EVI is listening"}
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center text-2xl">🎙</div>
          <div>
            <p className="text-sm font-semibold text-foreground">Connection failed</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">{error}</p>
            <p className="text-xs text-muted-foreground/60 mt-2 max-w-[240px]">
              Check your Hume API key and ensure your EVI configuration is set up at platform.hume.ai
            </p>
          </div>
        </div>
      )}

      {/* Connecting state */}
      {isConnecting && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
            <div className="absolute inset-2 rounded-full border border-primary/10 animate-ping" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">Connecting to EVI</p>
            <p className="text-xs text-muted-foreground mt-1">Activating microphone…</p>
          </div>
        </div>
      )}

      {/* Transcript */}
      {!error && (isConnected || transcript.length > 0) && (
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
          {transcript.length === 0 && isConnected && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-8">
              <div className="w-16 h-16 rounded-2xl bg-violet-500/12 border border-violet-500/20 flex items-center justify-center text-3xl">
                🎙
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">EVI is ready</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                  Speak naturally. EVI detects your vocal emotions in real time and responds with an empathic voice.
                </p>
              </div>
            </div>
          )}

          {transcript.map((entry) => {
            const isUser = entry.role === "user";
            return (
              <div key={entry.id} className={`flex flex-col ${isUser ? "items-end" : "items-start"} message-enter`}>
                <div className={`flex ${isUser ? "justify-end" : "justify-start"} w-full`}>
                  {!isUser && (
                    <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5 text-sm">
                      🎙
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-white/5 text-foreground rounded-bl-sm border border-white/8"
                  }`}>
                    <p className="whitespace-pre-wrap">{entry.content}</p>
                  </div>
                  {isUser && (
                    <div className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0 ml-2.5 mt-0.5">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-muted-foreground">
                        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                      </svg>
                    </div>
                  )}
                </div>
                {/* Voice emotion chips on user messages */}
                {isUser && entry.emotions && Object.keys(entry.emotions).length > 0 && (
                  <div className="mr-10 mt-1">
                    <p className="text-[9px] text-muted-foreground/50 mb-0.5 text-right">Vocal emotions detected</p>
                    <EmotionChips scores={entry.emotions} />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Footer info */}
      <div className="flex-none border-t border-white/6 px-5 py-2.5 flex items-center justify-between bg-black/15">
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-1 rounded-full bg-violet-400 opacity-60" />
          <span className="text-[10px] text-muted-foreground/50">Vocal emotion detected by Hume EVI</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-muted-foreground/30">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="currentColor" />
          </svg>
          <span className="text-[10px] text-muted-foreground/30">Mic active</span>
        </div>
      </div>
    </div>
  );
}

// ── Public wrapper — fetches API key then mounts VoiceProvider ─────────────
export default function HumeVoiceMode({ onVoiceEmotion, sessionId }: Props) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    fetch("/api/hume/config")
      .then((r) => r.json() as Promise<{ apiKey?: string; error?: string }>)
      .then((data) => {
        if (data.apiKey) setApiKey(data.apiKey);
        else setFetchError(true);
      })
      .catch(() => setFetchError(true));
  }, []);

  if (fetchError) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-center px-8 bg-background/60 backdrop-blur-sm">
        <div className="text-2xl">⚠️</div>
        <p className="text-sm font-semibold text-foreground">Hume API key not found</p>
        <p className="text-xs text-muted-foreground max-w-[220px]">Make sure HUME_API_KEY is set in Replit Secrets and the API server is running.</p>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-background/60 backdrop-blur-sm">
        <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <VoiceProvider clearMessagesOnDisconnect={false} messageHistoryLimit={200}>
      <VoiceModeInner apiKey={apiKey} onVoiceEmotion={onVoiceEmotion} sessionId={sessionId} />
    </VoiceProvider>
  );
}
