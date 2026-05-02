import { useEffect, useRef, useState, useCallback } from "react";
import { VoiceProvider, useVoice, VoiceReadyState, type JSONMessage } from "@humeai/voice-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface Props {
  onVoiceEmotion: (emotion: string | null, scores: Record<string, number> | null) => void;
  onExitVoice: () => void;
  sessionId: number | null;
  faceEmotionCounts: Record<string, number>;
}

interface HumeConfig {
  apiKey: string;
  configId: string | null;
}

interface EviInnerProps {
  apiKey: string;
  configId: string | null;
  onVoiceEmotion: (emotion: string | null, scores: Record<string, number> | null) => void;
  onExitVoice: () => void;
  faceEmotionCounts: Record<string, number>;
  voiceGender: "masculine" | "feminine";
  onVoiceGenderChange: (g: "masculine" | "feminine") => void;
}

interface Mode {
  id: string;
  label: string;
  emoji: string;
  color: string;
  systemPrompt: string;
}

const MODES: Mode[] = [
  { id: "therapist", label: "Therapist", emoji: "🧠", color: "#818cf8",
    systemPrompt: "You are EmpathIQ acting as a compassionate therapist. Use CBT techniques, validate feelings first, ask one open question at a time. Be warm and non-judgmental. Keep responses concise." },
  { id: "dating", label: "Dating Coach", emoji: "💘", color: "#f472b6",
    systemPrompt: "You are EmpathIQ acting as a confident, playful dating coach. Be honest, fun, and help the user build genuine confidence. Keep it real, not cheesy." },
  { id: "sales", label: "Sales Coach", emoji: "💼", color: "#34d399",
    systemPrompt: "You are EmpathIQ acting as a sharp sales coach. Help handle objections, close deals, and sharpen pitches. Be direct, tactical, and motivating." },
  { id: "meditation", label: "Meditation", emoji: "🧘", color: "#67e8f9",
    systemPrompt: "You are EmpathIQ acting as a calm meditation guide. Offer breathwork, body scans, grounding. Use gentle, spacious language. Help them arrive in the present moment." },
  { id: "smart-glasses", label: "Smart Glasses", emoji: "🥽", color: "#a78bfa",
    systemPrompt: "You are a real-time social assistant. Give short, actionable coaching about what to say and how to read the other person's emotions. Be a silent expert in their ear." },
  { id: "anger-release", label: "Anger Release", emoji: "😤", color: "#f87171",
    systemPrompt: "You are a safe space. Let the user vent. Validate everything. Never judge. Help them decompress." },
  { id: "focus-coach", label: "Focus Coach", emoji: "🎯", color: "#fbbf24",
    systemPrompt: "You are a productivity coach. Keep responses short. Help the user stay in flow, eliminate distraction, and execute." },
  { id: "sleep-guide", label: "Sleep Guide", emoji: "🌙", color: "#818cf8",
    systemPrompt: "You are a sleep companion. Speak slowly and warmly. Guide the user toward rest using breathing and calming storytelling." },
  { id: "confidence-booster", label: "Confidence Booster", emoji: "💪", color: "#fb923c",
    systemPrompt: "You are a hype coach. Lift the user's energy. Speak with conviction and warmth. Help them step into their best self." },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function topEmotion(scores: Record<string, number>): string | null {
  const entries = Object.entries(scores);
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function emotionColor(name: string | null): string {
  const map: Record<string, string> = {
    joy: "#facc15", happiness: "#facc15", amusement: "#fb923c", excitement: "#fb923c",
    admiration: "#fb923c", satisfaction: "#34d399", contentment: "#4ade80",
    sadness: "#60a5fa", distress: "#818cf8", anxiety: "#c084fc", fear: "#c084fc",
    horror: "#c084fc", anger: "#f87171", disgust: "#f87171", contempt: "#fb923c",
    calmness: "#4ade80", serenity: "#67e8f9", surprise: "#fb923c",
    interest: "#67e8f9", concentration: "#67e8f9", boredom: "#9ca3af", neutral: "#9ca3af",
  };
  if (!name) return "#818cf8";
  return map[name.toLowerCase()] ?? "#818cf8";
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

interface TxMsg { id: string; role: "user" | "assistant"; text: string; emotion: string | null; }

// ── Inner component (inside VoiceProvider context) ───────────────────────────
function EviInner({ apiKey, configId, onVoiceEmotion, onExitVoice, faceEmotionCounts, voiceGender, onVoiceGenderChange }: EviInnerProps) {
  const { connect, disconnect, readyState, messages, isMuted, mute, unmute } = useVoice();
  const [activeMode, setActiveMode] = useState<Mode>(MODES[0]);
  const [transcript, setTranscript] = useState<TxMsg[]>([]);
  const [topVoiceEmotion, setTopVoiceEmotion] = useState<string | null>(null);
  const [topVoiceScores, setTopVoiceScores] = useState<Record<string, number>>({});
  const [connectError, setConnectError] = useState<string | null>(null);
  const processedCount = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const assistantTurnIdRef = useRef<string | null>(null);

  const isOpen = readyState === VoiceReadyState.OPEN;
  const isConnecting = readyState === VoiceReadyState.CONNECTING;

  // Process only newly arrived messages, merging streamed assistant fragments
  useEffect(() => {
    const newMsgs = messages.slice(processedCount.current) as JSONMessage[];
    processedCount.current = messages.length;

    for (const msg of newMsgs) {
      if (msg.type === "user_message") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = msg as any;
        const text: string = m.message?.content ?? "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prosody: Record<string, number> = m.models?.prosody?.scores ?? {};
        const emotion = topEmotion(prosody);
        assistantTurnIdRef.current = null;
        if (text.trim()) {
          setTranscript((prev) => [...prev, { id: `u-${Date.now()}-${Math.random()}`, role: "user", text, emotion }]);
          setTopVoiceEmotion(emotion);
          setTopVoiceScores(prosody);
          onVoiceEmotion(emotion, prosody);
        }
      } else if (msg.type === "assistant_message") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = msg as any;
        const text: string = m.message?.content ?? "";
        if (!text.trim()) continue;

        if (!assistantTurnIdRef.current) {
          const id = `a-${Date.now()}-${Math.random()}`;
          assistantTurnIdRef.current = id;
          setTranscript((prev) => [...prev, { id, role: "assistant", text, emotion: null }]);
        } else {
          const turnId = assistantTurnIdRef.current;
          setTranscript((prev) =>
            prev.map((m) =>
              m.id === turnId ? { ...m, text: m.text + " " + text } : m
            )
          );
        }
      } else if (msg.type === "assistant_end") {
        assistantTurnIdRef.current = null;
      }
    }
  }, [messages, onVoiceEmotion]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Reset voice emotion when session ends
  useEffect(() => {
    if (readyState === VoiceReadyState.CLOSED || readyState === VoiceReadyState.IDLE) {
      onVoiceEmotion(null, null);
      setTopVoiceEmotion(null);
      setTopVoiceScores({});
      assistantTurnIdRef.current = null;
    }
  }, [readyState, onVoiceEmotion]);

  const handleStartSession = useCallback(() => {
    setConnectError(null);
    setTranscript([]);
    processedCount.current = 0;
    assistantTurnIdRef.current = null;
    void connect({
      auth: { type: "apiKey", value: apiKey },
      ...(configId ? { configId } : {}),
    });
  }, [connect, apiKey, configId]);

  const handleEndSession = useCallback(() => {
    void disconnect();
    setTopVoiceEmotion(null);
    setTopVoiceScores({});
    onVoiceEmotion(null, null);
    assistantTurnIdRef.current = null;
  }, [disconnect, onVoiceEmotion]);

  // Exit voice — disconnect first if live, then navigate back
  const handleExit = useCallback(() => {
    if (isOpen || isConnecting) {
      void disconnect();
      onVoiceEmotion(null, null);
    }
    onExitVoice();
  }, [isOpen, isConnecting, disconnect, onVoiceEmotion, onExitVoice]);

  const dominantFace = topEmotion(faceEmotionCounts);
  const voiceColor = emotionColor(topVoiceEmotion);

  const top5Prosody = Object.entries(topVoiceScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="flex flex-col h-full bg-background/60 backdrop-blur-sm">
      {/* ── Header ── */}
      <div className="flex-none flex items-center justify-between px-4 py-2.5 border-b border-white/8 bg-black/20">
        <div className="flex flex-col">
          <p className="text-xs font-semibold text-foreground">EVI Voice Mode</p>
          <p className="text-[10px] text-muted-foreground">Hume EVI · Claude Haiku 4.5</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Voice gender toggle — locked while session is live */}
          <div className="flex items-center rounded-lg overflow-hidden border border-white/10 text-[10px] font-medium">
            {(["feminine", "masculine"] as const).map((g) => {
              const active = voiceGender === g;
              return (
                <button
                  key={g}
                  onClick={() => {
                    if (active) return;
                    if (isOpen) handleEndSession();
                    onVoiceGenderChange(g);
                  }}
                  disabled={isOpen}
                  title={isOpen ? "End session to change voice" : undefined}
                  className="flex items-center gap-1 px-2.5 py-1 transition-all disabled:cursor-not-allowed"
                  style={active
                    ? { backgroundColor: g === "feminine" ? "rgba(244,114,182,0.2)" : "rgba(96,165,250,0.2)", color: g === "feminine" ? "#f472b6" : "#60a5fa" }
                    : { color: "var(--muted-foreground)", backgroundColor: "transparent" }}
                >
                  <span>{g === "feminine" ? "♀" : "♂"}</span>
                  <span className="capitalize">{g === "feminine" ? "Female" : "Male"}</span>
                </button>
              );
            })}
          </div>

          {/* Live indicator */}
          {isOpen && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium bg-red-500/12 text-red-300"
              style={{ boxShadow: "0 0 0 1px rgba(248,113,113,0.35)" }}>
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              Live
            </div>
          )}
        </div>
      </div>

      {/* ── Mode tabs — always interactive ── */}
      <div className="flex-none border-b border-white/6 bg-black/15">
        <div className="flex gap-1 px-3 py-2 overflow-x-auto no-scrollbar">
          {MODES.map((mode) => {
            const isActive = mode.id === activeMode.id;
            return (
              <button
                key={mode.id}
                onClick={() => {
                  setActiveMode(mode);
                  // If a session is live, end it — mode change takes effect on next connect
                  if (isOpen) {
                    handleEndSession();
                  }
                }}
                className="flex-none flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium whitespace-nowrap transition-all"
                style={isActive
                  ? { backgroundColor: `${mode.color}20`, color: mode.color, boxShadow: `0 0 0 1px ${mode.color}45` }
                  : { color: "var(--muted-foreground)" }}
              >
                <span>{mode.emoji}</span>
                {mode.label}
              </button>
            );
          })}
        </div>
        {isOpen && (
          <p className="text-center text-[9px] text-muted-foreground/50 pb-1.5">
            Switching mode ends the current session
          </p>
        )}
      </div>

      {/* ── Emotion reading row — only when connected ── */}
      {isOpen && (
        <div className="flex-none flex items-center gap-3 flex-wrap px-5 py-2 border-b border-white/5 bg-black/10">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">👁️ Face:</span>
            <span className="font-medium capitalize" style={{ color: emotionColor(dominantFace) }}>
              {dominantFace ?? "—"}
            </span>
          </div>
          <div className="w-px h-3 bg-white/10" />
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">🎙️ Voice:</span>
            <span className="font-medium capitalize" style={{ color: voiceColor }}>
              {topVoiceEmotion ?? "—"}
            </span>
            {topVoiceEmotion && topVoiceScores[topVoiceEmotion] && (
              <span className="text-muted-foreground">
                {Math.round(topVoiceScores[topVoiceEmotion] * 100)}%
              </span>
            )}
          </div>
          {top5Prosody.length > 0 && (
            <>
              <div className="w-px h-3 bg-white/10" />
              <div className="flex items-end gap-1 h-4">
                {top5Prosody.map(([name, score]) => (
                  <div key={name} title={`${name}: ${Math.round(score * 100)}%`}>
                    <div
                      className="w-2 rounded-sm transition-all duration-500"
                      style={{
                        height: `${Math.max(3, Math.round(score * 16))}px`,
                        backgroundColor: emotionColor(name),
                        opacity: 0.85,
                      }}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Transcript ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5 min-h-0">
        {transcript.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-8 opacity-60">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
              style={{ backgroundColor: `${activeMode.color}18`, boxShadow: `0 0 0 1px ${activeMode.color}30` }}>
              {activeMode.emoji}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{activeMode.label} — Voice Mode</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                Press the mic to start. EVI detects emotion in your voice and responds expressively.
              </p>
            </div>
          </div>
        )}

        {transcript.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
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

      {/* ── Error ── */}
      {connectError && (
        <div className="flex-none mx-4 mb-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
          {connectError}
        </div>
      )}

      {/* ── Controls ── */}
      <div className="flex-none px-6 pb-5 pt-3 flex flex-col items-center gap-2.5 border-t border-white/5">
        {isOpen && !isMuted && <SoundWave color="#f87171" />}

        {isOpen ? (
          <button
            onClick={handleEndSession}
            className="relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none"
            style={{
              backgroundColor: "rgba(248,113,113,0.18)",
              boxShadow: "0 0 0 2px rgba(248,113,113,0.5), 0 0 28px rgba(248,113,113,0.3)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round">
              <rect x="6" y="4" width="4" height="16" rx="1" fill="#f87171" fillOpacity="0.8" />
              <rect x="14" y="4" width="4" height="16" rx="1" fill="#f87171" fillOpacity="0.8" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleStartSession}
            disabled={isConnecting}
            className="relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none disabled:opacity-50"
            style={{
              backgroundColor: `${activeMode.color}20`,
              boxShadow: `0 0 0 1.5px ${activeMode.color}60`,
            }}
          >
            {isConnecting ? (
              <div className="w-5 h-5 rounded-full border-2 border-transparent border-t-violet-400 animate-spin" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={activeMode.color} strokeWidth="2" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
        )}

        {isOpen && (
          <button
            onClick={() => (isMuted ? unmute() : mute())}
            className="text-xs px-3 py-1 rounded-full transition-colors"
            style={isMuted
              ? { backgroundColor: "rgba(248,113,113,0.15)", color: "#f87171", boxShadow: "0 0 0 1px rgba(248,113,113,0.3)" }
              : { backgroundColor: "rgba(255,255,255,0.05)", color: "var(--muted-foreground)" }}
          >
            {isMuted ? "🔇 Muted — tap to unmute" : "🎙️ Tap to mute"}
          </button>
        )}

        <p className="text-xs text-muted-foreground">
          {isConnecting ? "Connecting to EVI…" : isOpen ? "Tap to end session" : "Tap mic to start"}
        </p>
      </div>
    </div>
  );
}

type VoiceGender = "masculine" | "feminine";

const VOICE_LABELS: Record<VoiceGender, { label: string; subtitle: string; icon: string }> = {
  masculine: { label: "Male",   subtitle: "ITO",  icon: "♂" },
  feminine:  { label: "Female", subtitle: "KORA", icon: "♀" },
};

// ── Outer wrapper ─────────────────────────────────────────────────────────────
export default function HumeVoiceMode({ onVoiceEmotion, onExitVoice, sessionId: _sessionId, faceEmotionCounts }: Props) {
  const [voiceGender, setVoiceGender] = useState<VoiceGender>("feminine");
  const [config, setConfig] = useState<HumeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Re-fetch config whenever voice gender changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/hume/token?voice=${voiceGender}`)
      .then((r) => r.json())
      .then((d: unknown) => {
        if (cancelled) return;
        const data = d as { apiKey?: string; configId?: string | null; error?: string };
        if (data.error || !data.apiKey) {
          setError(data.error ?? "Missing HUME_API_KEY — add it in Replit Secrets.");
        } else {
          setConfig({ apiKey: data.apiKey, configId: data.configId ?? null });
        }
      })
      .catch(() => { if (!cancelled) setError("Could not reach the server."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [voiceGender]);

  // Raw message handler — runs before the SDK builds its messages array,
  // so models.prosody.scores is still intact here.
  const handleRawMessage = useCallback((message: JSONMessage) => {
    if (message.type === "user_message") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = message as any;
      const scores: Record<string, number> = m.models?.prosody?.scores ?? {};
      if (Object.keys(scores).length > 0) {
        const entries = Object.entries(scores);
        const top = entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        onVoiceEmotion(top, scores);
      }
    }
  }, [onVoiceEmotion]);

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
      <div className="flex flex-col h-full items-center justify-center gap-4 px-8 text-center">
        <div className="text-3xl">🎙️</div>
        <p className="text-sm font-medium text-foreground">EVI not configured</p>
        <p className="text-xs text-muted-foreground max-w-[260px]">{error ?? "Unknown error"}</p>
        <button
          onClick={onExitVoice}
          className="mt-2 px-4 py-2 rounded-lg text-xs font-medium bg-white/6 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all"
        >
          ← Back to Chat
        </button>
      </div>
    );
  }

  return (
    <VoiceProvider clearMessagesOnDisconnect onMessage={handleRawMessage}>
      <EviInner
        apiKey={config.apiKey}
        configId={config.configId}
        onVoiceEmotion={onVoiceEmotion}
        onExitVoice={onExitVoice}
        faceEmotionCounts={faceEmotionCounts}
        voiceGender={voiceGender}
        onVoiceGenderChange={setVoiceGender}
      />
    </VoiceProvider>
  );
}
