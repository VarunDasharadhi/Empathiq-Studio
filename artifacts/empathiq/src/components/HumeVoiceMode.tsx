import { useEffect, useRef, useState, useCallback } from "react";
import { VoiceProvider, useVoice, VoiceReadyState, type JSONMessage } from "@humeai/voice-react";

// ── Persona configs ────────────────────────────────────────────────────────
interface Persona {
  id: string;
  label: string;
  emoji: string;
  color: string;
  glow: string;
  systemPrompt: string;
}

const PERSONAS: Persona[] = [
  {
    id: "therapist",
    label: "Therapist",
    emoji: "🧠",
    color: "#818cf8",
    glow: "rgba(129,140,248,0.5)",
    systemPrompt:
      "You are EmpathIQ, a compassionate and warm therapist. Speak gently at a measured pace. Always validate feelings before exploring them. Ask only one open question at a time. Your tone is calm, safe, and non-judgmental. Never diagnose. Be a caring presence.",
  },
  {
    id: "dating",
    label: "Dating Coach",
    emoji: "💘",
    color: "#f472b6",
    glow: "rgba(244,114,182,0.5)",
    systemPrompt:
      "You are EmpathIQ, a confident and playful dating coach. Be direct, fun, and a little cheeky — never preachy. Help them understand attraction and build genuine confidence. Your voice is warm and engaging. Keep it real, not cheesy.",
  },
  {
    id: "sales",
    label: "Sales Coach",
    emoji: "💼",
    color: "#34d399",
    glow: "rgba(52,211,153,0.5)",
    systemPrompt:
      "You are EmpathIQ, a sharp and energetic sales coach. Be direct, tactical, and motivating. Use proven frameworks when helpful. Push them to think bigger and execute better. Your voice is assertive and inspiring.",
  },
  {
    id: "meditation",
    label: "Meditation",
    emoji: "🧘",
    color: "#67e8f9",
    glow: "rgba(103,232,249,0.5)",
    systemPrompt:
      "You are EmpathIQ, a peaceful meditation guide. Speak very slowly and softly with gentle pauses. Offer breathwork, body scans, and grounding techniques. Your language is spacious and calming. Help them arrive in the present moment.",
  },
];

// ── Gender configs ─────────────────────────────────────────────────────────
type Gender = "male" | "female" | "neutral";

const GENDER_OPTIONS: Array<{ value: Gender; label: string; icon: string; hint: string }> = [
  { value: "male",    label: "Male",    icon: "♂", hint: "Deeper, authoritative voice" },
  { value: "female",  label: "Female",  icon: "♀", hint: "Warm, expressive voice" },
  { value: "neutral", label: "Neutral", icon: "◎", hint: "Default EVI voice" },
];

// ── Types ──────────────────────────────────────────────────────────────────
interface EVIConfig { id: string; version: number; name: string; }
interface EVIVoice  { id: string; name: string; }

interface HumeConfig {
  apiKey: string;
  configs: EVIConfig[];
  voices: EVIVoice[];
}

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

// ── Helpers ────────────────────────────────────────────────────────────────
const EMOTION_COLORS: Record<string, string> = {
  happy: "#facc15", sad: "#60a5fa", angry: "#f87171",
  fearful: "#c084fc", disgusted: "#4ade80", surprised: "#fb923c",
  neutral: "#9ca3af", excited: "#fb923c", joy: "#facc15",
  anxiety: "#c084fc", distress: "#60a5fa", calmness: "#4ade80",
  amusement: "#facc15", awe: "#67e8f9", confusion: "#9ca3af",
  contempt: "#f87171", pain: "#f87171",
};

function getDominantEmotion(scores: Record<string, number>): { label: string; score: number } {
  const entries = Object.entries(scores);
  if (!entries.length) return { label: "neutral", score: 0 };
  const [label, score] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  return { label, score };
}

// Guess voice gender from name heuristics
function voiceMatchesGender(name: string, gender: Gender): boolean {
  const lower = name.toLowerCase();
  if (gender === "male")   return /\b(male|man|men|guy|masculine|bass|baritone|ivo|orion|adam|sam)\b/.test(lower);
  if (gender === "female") return /\b(female|woman|women|girl|feminine|soprano|alto|kora|aura|ito|dacher)\b/.test(lower);
  return true;
}

// ── Dual-source FFT visualizer ─────────────────────────────────────────────
function DualFftVisualizer({
  micFft, speakerFft, isPlaying, persona,
}: {
  micFft: number[];
  speakerFft: number[];
  isPlaying: boolean;
  persona: Persona;
}) {
  const bars = 24;
  const activeArr  = isPlaying ? speakerFft : micFft;
  const step = Math.max(1, Math.floor(activeArr.length / bars));
  const color = isPlaying ? persona.color : "#ffffff";
  const hasSignal = activeArr.some((v) => v > 0.02);

  return (
    <div className="flex flex-col items-center gap-1.5 py-3 px-4">
      <div className="flex items-end justify-center gap-[3px]" style={{ height: 44 }}>
        {Array.from({ length: bars }).map((_, i) => {
          const raw = activeArr[i * step] ?? 0;
          const h = hasSignal ? Math.max(3, Math.round(raw * 40)) : 3;
          return (
            <div
              key={i}
              className="w-[3.5px] rounded-full"
              style={{
                height: `${h}px`,
                backgroundColor: color,
                opacity: hasSignal ? 0.5 + raw * 0.5 : 0.15,
                transition: "height 80ms ease-out, opacity 150ms ease-out",
              }}
            />
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/60 leading-none">
        {isPlaying
          ? `${persona.emoji} EVI is speaking…`
          : hasSignal
            ? "🎙 Listening to you…"
            : "🎙 Speak naturally — EVI is ready"}
      </p>
    </div>
  );
}

// ── Persona selector pill row ──────────────────────────────────────────────
function PersonaSelector({ selected, onSelect }: { selected: Persona; onSelect: (p: Persona) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none px-4 pt-2.5 pb-1">
      {PERSONAS.map((p) => {
        const isActive = p.id === selected.id;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className="flex-none flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-300 whitespace-nowrap"
            style={isActive
              ? { backgroundColor: `${p.color}18`, color: p.color, boxShadow: `0 0 0 1.5px ${p.color}, 0 0 10px ${p.glow}` }
              : { backgroundColor: "transparent", color: "var(--muted-foreground)", boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }}
          >
            <span>{p.emoji}</span><span>{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Gender + voice selector row ────────────────────────────────────────────
function GenderVoiceSelector({
  gender, voices, selectedVoiceId,
  onGenderChange, onVoiceChange,
}: {
  gender: Gender | null;
  voices: EVIVoice[];
  selectedVoiceId: string | null;
  onGenderChange: (g: Gender) => void;
  onVoiceChange: (id: string | null) => void;
}) {
  const filteredVoices = voices.filter((v) => !gender || gender === "neutral" || voiceMatchesGender(v.name, gender));
  const displayVoices  = filteredVoices.length > 0 ? filteredVoices : voices;

  return (
    <div className="flex items-center gap-2 px-4 pb-2.5">
      {/* Gender pills */}
      <div className="flex gap-1 flex-shrink-0">
        {GENDER_OPTIONS.map((g) => {
          const isActive = gender === g.value;
          return (
            <button
              key={g.value}
              onClick={() => onGenderChange(g.value)}
              title={g.hint}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all ${
                isActive
                  ? "bg-primary/20 text-primary shadow-sm shadow-primary/20"
                  : "bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/8"
              }`}
            >
              <span className="text-sm leading-none">{g.icon}</span>
              <span>{g.label}</span>
            </button>
          );
        })}
      </div>

      {/* Voice selector */}
      {displayVoices.length > 0 ? (
        <select
          value={selectedVoiceId ?? ""}
          onChange={(e) => onVoiceChange(e.target.value || null)}
          className="flex-1 min-w-0 text-[11px] rounded-lg bg-white/5 border border-white/10 text-foreground px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          <option value="">Default voice</option>
          {displayVoices.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      ) : (
        <span className="text-[10px] text-muted-foreground/50 italic">
          Add voices in Hume platform for gender selection
        </span>
      )}
    </div>
  );
}

// ── Vocal emotion chips ────────────────────────────────────────────────────
function EmotionChips({ scores }: { scores: Record<string, number> }) {
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {top.map(([label, score]) => {
        const color = EMOTION_COLORS[label.toLowerCase()] ?? "#9ca3af";
        return (
          <span key={label} className="text-[9px] font-medium px-1.5 py-0.5 rounded-full capitalize"
            style={{ backgroundColor: `${color}20`, color }}>
            {label} {Math.round(score * 100)}%
          </span>
        );
      })}
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ readyState, error }: { readyState: VoiceReadyState; error: unknown }) {
  if (error) return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/12 border border-red-500/20">
      <span className="text-[10px] text-red-400 font-medium">Error</span>
    </div>
  );
  if (readyState === VoiceReadyState.OPEN) return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/12 border border-green-500/20">
      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
      <span className="text-[10px] text-green-400 font-medium">Connected</span>
    </div>
  );
  if (readyState === VoiceReadyState.CONNECTING) return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/12 border border-amber-500/20">
      <div className="w-3 h-3 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
      <span className="text-[10px] text-amber-400 font-medium">Connecting…</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
      <span className="text-[10px] text-muted-foreground font-medium">Disconnected</span>
    </div>
  );
}

// ── Inner component (must be child of VoiceProvider) ──────────────────────
function VoiceModeInner({
  apiKey, configs, voices, onVoiceEmotion, sessionId,
}: {
  apiKey: string;
  configs: EVIConfig[];
  voices: EVIVoice[];
  onVoiceEmotion: Props["onVoiceEmotion"];
  sessionId: number | null;
}) {
  const {
    connect, disconnect, readyState, messages,
    fft, micFft, isPlaying,
    sendSessionSettings, status, error,
    clearMessages,
  } = useVoice();

  const [transcript, setTranscript]           = useState<TranscriptEntry[]>([]);
  const [persona, setPersona]                 = useState<Persona>(PERSONAS[0]);
  const [gender, setGender]                   = useState<Gender>("neutral");
  const [selectedConfigId, setSelectedConfig] = useState<string | null>(configs[0]?.id ?? null);
  const [selectedVoiceId, setSelectedVoice]   = useState<string | null>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const connectRef = useRef(false);
  const prevLenRef = useRef(0);

  // ── Connection helper ────────────────────────────────────────────────────
  const doConnect = useCallback(async (opts: {
    persona: Persona; configId: string | null; voiceId: string | null;
  }) => {
    await connect({
      auth:      { type: "apiKey", value: apiKey },
      ...(opts.configId ? { configId: opts.configId } : {}),
      sessionSettings: {
        type: "session_settings" as const,
        systemPrompt: opts.persona.systemPrompt,
        ...(opts.voiceId ? { voiceId: opts.voiceId } : {}),
      },
      audioConstraints: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  }, [apiKey, connect]);

  // Auto-connect on mount
  useEffect(() => {
    if (connectRef.current) return;
    connectRef.current = true;
    doConnect({ persona: PERSONAS[0], configId: configs[0]?.id ?? null, voiceId: null })
      .catch(() => {}); // error shown via status
    return () => { disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persona change → disconnect + reconnect ──────────────────────────────
  const handlePersonaChange = useCallback(async (p: Persona) => {
    if (p.id === persona.id) return;
    setPersona(p);
    clearMessages();
    setTranscript([]);
    prevLenRef.current = 0;
    if (readyState === VoiceReadyState.OPEN) {
      await disconnect();
    }
    await doConnect({ persona: p, configId: selectedConfigId, voiceId: selectedVoiceId });
  }, [persona.id, readyState, disconnect, doConnect, selectedConfigId, selectedVoiceId, clearMessages]);

  // ── EVI config change → disconnect + reconnect ───────────────────────────
  const handleConfigChange = useCallback(async (configId: string | null) => {
    setSelectedConfig(configId);
    clearMessages();
    setTranscript([]);
    prevLenRef.current = 0;
    if (readyState === VoiceReadyState.OPEN) await disconnect();
    await doConnect({ persona, configId, voiceId: selectedVoiceId });
  }, [readyState, disconnect, doConnect, persona, selectedVoiceId, clearMessages]);

  // ── Voice ID change → send session settings live (no reconnect needed) ───
  const handleVoiceChange = useCallback((voiceId: string | null) => {
    setSelectedVoice(voiceId);
    if (readyState === VoiceReadyState.OPEN) {
      sendSessionSettings({ ...(voiceId ? { voiceId } : {}) } as Parameters<typeof sendSessionSettings>[0]);
    }
  }, [readyState, sendSessionSettings]);

  // ── Gender change → auto-pick matching voice, live-update ────────────────
  const handleGenderChange = useCallback((g: Gender) => {
    setGender(g);
    if (g === "neutral") {
      handleVoiceChange(null);
      return;
    }
    const match = voices.find((v) => voiceMatchesGender(v.name, g));
    if (match) handleVoiceChange(match.id);
    else        handleVoiceChange(null); // no match — default voice used
  }, [voices, handleVoiceChange]);

  // ── Parse messages into transcript + extract voice emotion ────────────────
  useEffect(() => {
    const jsonMsgs = messages.filter(
      (m): m is JSONMessage =>
        !("code" in m) &&
        (m as { type?: string }).type !== "socket_connected" &&
        (m as { type?: string }).type !== "socket_disconnected" &&
        (m as { type?: string }).type !== "session_settings",
    );

    const entries: TranscriptEntry[] = [];
    for (const m of jsonMsgs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mm = m as any;
      const type: string = mm.type ?? "";

      if (type === "user_message") {
        const content: string = mm.message?.content ?? "";
        if (!content.trim()) continue;
        const scores: Record<string, number> = mm.models?.prosody?.scores ?? {};
        entries.push({ id: `u-${String(mm.receivedAt)}`, role: "user", content, emotions: Object.keys(scores).length ? scores : undefined, receivedAt: mm.receivedAt ?? new Date() });
        if (Object.keys(scores).length) {
          onVoiceEmotion(getDominantEmotion(scores).label, scores);
        }
      } else if (type === "assistant_message") {
        const content: string = mm.message?.content ?? "";
        if (!content.trim()) continue;
        entries.push({ id: `a-${String(mm.receivedAt)}`, role: "assistant", content, receivedAt: mm.receivedAt ?? new Date() });
      }
    }
    setTranscript(entries);
  }, [messages, onVoiceEmotion]);

  // ── Save new transcript entries to session ────────────────────────────────
  useEffect(() => {
    if (!sessionId || transcript.length === 0) return;
    const newEntries = transcript.slice(prevLenRef.current);
    prevLenRef.current = transcript.length;
    for (const e of newEntries) {
      fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: e.role, content: e.content, emotion: null }),
      }).catch(() => {});
    }
  }, [transcript, sessionId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [transcript]);

  const isOpen = readyState === VoiceReadyState.OPEN;

  return (
    <div className="flex flex-col h-full bg-background/60 backdrop-blur-sm">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-white/8 bg-black/20">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="text-base">🎙</span>Hume Voice Mode
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">EVI · Empathic Voice Interface</p>
        </div>
        <div className="flex items-center gap-2">
          {/* EVI config dropdown (only when multiple configs exist) */}
          {configs.length > 1 && (
            <select
              value={selectedConfigId ?? ""}
              onChange={(e) => handleConfigChange(e.target.value || null)}
              className="text-[10px] rounded-lg bg-white/5 border border-white/10 text-muted-foreground px-2 py-1 focus:outline-none max-w-[110px] truncate"
            >
              <option value="">Default config</option>
              {configs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <StatusBadge readyState={readyState} error={error} />
        </div>
      </div>

      {/* ── Persona selector ────────────────────────────────────────────── */}
      <div className="flex-none border-b border-white/6">
        <PersonaSelector selected={persona} onSelect={handlePersonaChange} />
        <GenderVoiceSelector
          gender={gender}
          voices={voices}
          selectedVoiceId={selectedVoiceId}
          onGenderChange={handleGenderChange}
          onVoiceChange={handleVoiceChange}
        />
      </div>

      {/* ── Visualizer ──────────────────────────────────────────────────── */}
      {isOpen && (
        <div className="flex-none border-b border-white/6 bg-black/10"
          style={{ borderBottom: `1px solid ${persona.color}18` }}>
          <DualFftVisualizer
            micFft={micFft}
            speakerFft={fft}
            isPlaying={isPlaying}
            persona={persona}
          />
        </div>
      )}

      {/* ── Error / Connecting / Empty states ───────────────────────────── */}
      {status.value === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center text-2xl">🎙</div>
          <div>
            <p className="text-sm font-semibold text-foreground">Connection failed</p>
            <p className="text-xs text-muted-foreground mt-1">{"reason" in status ? status.reason : "Unknown error"}</p>
            <p className="text-xs text-muted-foreground/60 mt-2 max-w-[240px]">Check your Hume API key and EVI configuration at platform.hume.ai</p>
          </div>
          <button onClick={() => doConnect({ persona, configId: selectedConfigId, voiceId: selectedVoiceId })}
            className="px-4 py-2 rounded-xl bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors">
            Retry connection
          </button>
        </div>
      )}

      {readyState === VoiceReadyState.CONNECTING && status.value !== "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">Connecting to EVI</p>
            <p className="text-xs text-muted-foreground mt-1">{persona.emoji} {persona.label} · Activating microphone…</p>
          </div>
        </div>
      )}

      {/* ── Transcript ──────────────────────────────────────────────────── */}
      {(isOpen || transcript.length > 0) && status.value !== "error" && (
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
          {transcript.length === 0 && isOpen && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-8">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                style={{ backgroundColor: `${persona.color}18`, boxShadow: `0 0 0 1px ${persona.color}30` }}>
                {persona.emoji}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{persona.label} is ready</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                  Speak naturally. EVI detects your vocal emotions in real time and responds with an empathic human voice.
                </p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/3">
                <span className="text-[10px] text-muted-foreground/60">
                  Gender: <span className="text-foreground/70 font-medium capitalize">{gender}</span>
                  {selectedVoiceId ? ` · ${voices.find((v) => v.id === selectedVoiceId)?.name ?? "Custom voice"}` : " · Default voice"}
                </span>
              </div>
            </div>
          )}

          {transcript.map((entry) => {
            const isUser = entry.role === "user";
            return (
              <div key={entry.id} className={`flex flex-col ${isUser ? "items-end" : "items-start"} message-enter`}>
                <div className={`flex ${isUser ? "justify-end" : "justify-start"} w-full`}>
                  {!isUser && (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5 text-sm"
                      style={{ backgroundColor: `${persona.color}20` }}>
                      {persona.emoji}
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

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex-none border-t border-white/6 px-4 py-2 flex items-center justify-between bg-black/15"
        style={{ borderTop: `1px solid ${persona.color}18` }}>
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-1 rounded-full opacity-60" style={{ backgroundColor: persona.color }} />
          <span className="text-[10px] text-muted-foreground/50">Vocal emotions by Hume EVI · Face by face-api.js</span>
        </div>
        {isOpen && (
          <div className="flex items-center gap-1.5">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="text-muted-foreground/30">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            </svg>
            <span className="text-[10px] text-muted-foreground/30">Mic active</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Public wrapper — fetches config then mounts VoiceProvider ──────────────
export default function HumeVoiceMode({ onVoiceEmotion, sessionId }: Props) {
  const [humeConfig, setHumeConfig] = useState<HumeConfig | null>(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    fetch("/api/hume/config")
      .then((r) => r.json() as Promise<Partial<HumeConfig> & { error?: string }>)
      .then((data) => {
        if (data.apiKey) setHumeConfig({ apiKey: data.apiKey, configs: data.configs ?? [], voices: data.voices ?? [] });
        else setFetchError(true);
      })
      .catch(() => setFetchError(true));
  }, []);

  if (fetchError) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-center px-8 bg-background/60 backdrop-blur-sm">
        <div className="text-2xl">⚠️</div>
        <p className="text-sm font-semibold text-foreground">Hume API key not found</p>
        <p className="text-xs text-muted-foreground max-w-[220px]">
          Make sure HUME_API_KEY is set in Replit Secrets and the API server is running.
        </p>
      </div>
    );
  }

  if (!humeConfig) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-background/60 backdrop-blur-sm">
        <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <VoiceProvider clearMessagesOnDisconnect={false} messageHistoryLimit={300}>
      <VoiceModeInner
        apiKey={humeConfig.apiKey}
        configs={humeConfig.configs}
        voices={humeConfig.voices}
        onVoiceEmotion={onVoiceEmotion}
        sessionId={sessionId}
      />
    </VoiceProvider>
  );
}
