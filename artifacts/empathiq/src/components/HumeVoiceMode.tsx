import { useEffect, useRef, useState, useCallback } from "react";
import { VoiceProvider, useVoice, VoiceReadyState, type JSONMessage } from "@humeai/voice-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface Props {
  onVoiceEmotion: (emotion: string | null, scores: Record<string, number> | null) => void;
  sessionId: number | null;
  faceEmotionCounts: Record<string, number>;
}

interface HumeConfig {
  apiKey: string;
  configId: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function topEmotion(scores: Record<string, number>): string | null {
  const entries = Object.entries(scores);
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function emotionColor(name: string | null): string {
  const map: Record<string, string> = {
    joy: "#facc15", happiness: "#facc15", amusement: "#fb923c", excitement: "#fb923c",
    sadness: "#60a5fa", distress: "#818cf8", anxiety: "#c084fc", fear: "#c084fc",
    anger: "#f87171", disgust: "#f87171", contempt: "#fb923c",
    calmness: "#4ade80", contentment: "#4ade80", satisfaction: "#34d399",
    surprise: "#fb923c", interest: "#67e8f9", concentration: "#67e8f9",
    boredom: "#9ca3af", neutral: "#9ca3af",
  };
  if (!name) return "#818cf8";
  const key = name.toLowerCase();
  return map[key] ?? "#818cf8";
}

function SoundWave({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-[3px] h-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="w-[3px] rounded-full"
          style={{ backgroundColor: color, height: "100%", animation: `soundBar 1.2s ease-in-out ${i * 0.12}s infinite` }}
        />
      ))}
    </div>
  );
}

// ── Transcript message ───────────────────────────────────────────────────────
interface TxMsg { id: string; role: "user" | "assistant"; text: string; emotion: string | null; scores: Record<string, number> }

// ── Inner component (needs VoiceProvider context) ────────────────────────────
function EviInner({ onVoiceEmotion, faceEmotionCounts }: Omit<Props, "sessionId">) {
  const { connect, disconnect, readyState, messages, isMuted, mute, unmute } = useVoice();
  const [transcript, setTranscript] = useState<TxMsg[]>([]);
  const [topVoiceEmotion, setTopVoiceEmotion] = useState<string | null>(null);
  const [topVoiceScores, setTopVoiceScores] = useState<Record<string, number>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  const isConnected = readyState === VoiceReadyState.OPEN;
  const isConnecting = readyState === VoiceReadyState.CONNECTING;

  // Parse Hume EVI messages
  useEffect(() => {
    if (!messages.length) return;
    const latest = messages[messages.length - 1] as JSONMessage;

    if (latest.type === "user_message") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = latest as any;
      const text: string = msg.message?.content ?? "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prosody: Record<string, number> = msg.models?.prosody?.scores ?? {};
      const emotion = topEmotion(prosody);
      onVoiceEmotion(emotion, prosody);
      setTopVoiceEmotion(emotion);
      setTopVoiceScores(prosody);
      if (text.trim()) {
        setTranscript((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text, emotion, scores: prosody }]);
      }
    }

    if (latest.type === "assistant_message") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = latest as any;
      const text: string = msg.message?.content ?? "";
      if (text.trim()) {
        setTranscript((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", text, emotion: null, scores: {} }]);
      }
    }
  }, [messages, onVoiceEmotion]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Clear transcript on disconnect
  useEffect(() => {
    if (!isConnected && !isConnecting) {
      onVoiceEmotion(null, null);
      setTopVoiceEmotion(null);
      setTopVoiceScores({});
    }
  }, [isConnected, isConnecting, onVoiceEmotion]);

  const handleToggle = useCallback(() => {
    if (isConnected || isConnecting) {
      disconnect();
    } else {
      setTranscript([]);
      connect().catch(() => {});
    }
  }, [isConnected, isConnecting, connect, disconnect]);

  // Dominant face emotion for combined reading
  const dominantFace = topEmotion(faceEmotionCounts);
  const voiceColor = emotionColor(topVoiceEmotion);
  const micColor = isConnected ? "#f87171" : "#818cf8";

  return (
    <div className="flex flex-col h-full bg-background/60 backdrop-blur-sm">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-5 py-3.5 border-b border-white/8 bg-black/20">
        <div>
          <p className="text-sm font-semibold text-foreground">EVI Voice Mode</p>
          <p className="text-xs text-muted-foreground mt-0.5">Powered by Hume + Claude Haiku 4.5</p>
        </div>
        {isConnected && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: "rgba(248,113,113,0.12)", color: "#f87171", boxShadow: "0 0 0 1px rgba(248,113,113,0.35)" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            Live
          </div>
        )}
      </div>

      {/* Emotion reading row */}
      {isConnected && (
        <div className="flex-none flex items-center gap-3 px-5 py-2.5 border-b border-white/5 bg-black/10">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">👁️ Face:</span>
            <span className="font-medium capitalize" style={{ color: emotionColor(dominantFace) }}>
              {dominantFace ?? "—"}
            </span>
          </div>
          <div className="w-px h-3 bg-white/10" />
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">🎙️ Voice Emotion:</span>
            <span className="font-medium capitalize" style={{ color: voiceColor }}>
              {topVoiceEmotion ?? "—"}
            </span>
          </div>
          {topVoiceEmotion && (
            <>
              <div className="w-px h-3 bg-white/10" />
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">🧠 Reading:</span>
                <span className="font-medium" style={{ color: voiceColor }}>
                  {topVoiceScores[topVoiceEmotion] ? `${Math.round(topVoiceScores[topVoiceEmotion] * 100)}%` : ""}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 min-h-0">
        {transcript.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-10 opacity-60">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{ backgroundColor: "rgba(129,140,248,0.12)", boxShadow: "0 0 0 1px rgba(129,140,248,0.25)" }}>
              🎙️
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Speak naturally</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                EVI detects your vocal emotion in real time and responds with an expressive human voice
              </p>
            </div>
          </div>
        )}

        {transcript.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
            <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-white/5 border border-white/8 text-foreground rounded-bl-sm"
            }`}>
              {msg.role === "user" && msg.emotion && (
                <div className="flex items-center gap-1 mb-1 text-[10px] font-medium opacity-75">
                  <div className="w-1 h-1 rounded-full" style={{ backgroundColor: emotionColor(msg.emotion) }} />
                  <span className="capitalize">{msg.emotion}</span>
                </div>
              )}
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Mic control */}
      <div className="flex-none px-6 pb-6 pt-3 flex flex-col items-center gap-3 border-t border-white/5">
        {isConnected && !isMuted && <SoundWave color={micColor} />}

        <button
          onClick={handleToggle}
          disabled={isConnecting}
          className="relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none disabled:opacity-50"
          style={{
            backgroundColor: isConnected ? "rgba(248,113,113,0.18)" : "rgba(129,140,248,0.18)",
            boxShadow: isConnected
              ? "0 0 0 0 rgba(248,113,113,0.6), 0 0 28px rgba(248,113,113,0.4)"
              : "0 0 0 1.5px rgba(129,140,248,0.5)",
            animation: isConnected ? "modePulse 1.5s ease-in-out infinite" : "none",
          }}
        >
          {isConnecting ? (
            <div className="w-6 h-6 rounded-full border-2 border-transparent border-t-violet-400 animate-spin" />
          ) : isConnected ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round">
              <rect x="6" y="4" width="4" height="16" rx="1" fill="#f87171" fillOpacity="0.8" />
              <rect x="14" y="4" width="4" height="16" rx="1" fill="#f87171" fillOpacity="0.8" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        {isConnected && (
          <button
            onClick={() => (isMuted ? unmute() : mute())}
            className="text-xs px-3 py-1.5 rounded-full transition-colors"
            style={isMuted
              ? { backgroundColor: "rgba(248,113,113,0.15)", color: "#f87171", boxShadow: "0 0 0 1px rgba(248,113,113,0.3)" }
              : { backgroundColor: "rgba(255,255,255,0.05)", color: "var(--muted-foreground)" }}
          >
            {isMuted ? "🔇 Muted — tap to unmute" : "🎙️ Tap to mute"}
          </button>
        )}

        <p className="text-xs text-muted-foreground">
          {isConnecting ? "Connecting to EVI…" : isConnected ? "Tap to end session" : "Tap to start voice session"}
        </p>
      </div>
    </div>
  );
}

// ── Wrapper that fetches creds + provides VoiceProvider context ──────────────
export default function HumeVoiceMode({ onVoiceEmotion, sessionId, faceEmotionCounts }: Props) {
  const [config, setConfig] = useState<HumeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/hume/token")
      .then((r) => r.json())
      .then((d: unknown) => {
        if (cancelled) return;
        const data = d as { apiKey?: string; configId?: string | null; error?: string };
        if (data.error || !data.apiKey) {
          setError(data.error ?? "Missing HUME_API_KEY — add it to Replit Secrets.");
        } else {
          setConfig({ apiKey: data.apiKey, configId: data.configId ?? null });
        }
      })
      .catch(() => { if (!cancelled) setError("Could not reach the server."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-muted-foreground">
        <div className="w-8 h-8 rounded-full border-2 border-transparent border-t-violet-400 animate-spin" />
        <p className="text-sm">Loading EVI…</p>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 px-8 text-center">
        <div className="text-3xl">🎙️</div>
        <p className="text-sm font-medium text-foreground">EVI not configured</p>
        <p className="text-xs text-muted-foreground">{error ?? "Unknown error"}</p>
      </div>
    );
  }

  return (
    <VoiceProvider
      auth={{ type: "apiKey", value: config.apiKey }}
      configId={config.configId ?? undefined}
    >
      <EviInner
        onVoiceEmotion={onVoiceEmotion}
        faceEmotionCounts={faceEmotionCounts}
      />
    </VoiceProvider>
  );
}
