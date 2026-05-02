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

const GENDER_OPTIONS: Array<{ value: Gender; label: string; icon: string }> = [
  { value: "male",    label: "Male",    icon: "♂" },
  { value: "female",  label: "Female",  icon: "♀" },
  { value: "neutral", label: "Neutral", icon: "◎" },
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

interface VoiceSummary {
  emotions: string;
  themes: string;
  coherenceScore: number;
  coherenceNote: string;
  takeaway: string;
}

interface Props {
  onVoiceEmotion: (emotion: string | null, scores: Record<string, number> | null) => void;
  sessionId: number | null;
  faceEmotionCounts: Record<string, number>;
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

function voiceMatchesGender(name: string, gender: Gender): boolean {
  const lower = name.toLowerCase();
  if (gender === "male")   return /\b(male|man|men|masculine|bass|baritone|ivo|orion|adam|sam|dacher)\b/.test(lower);
  if (gender === "female") return /\b(female|woman|women|feminine|soprano|alto|kora|aura|ito|aria|ella)\b/.test(lower);
  return true;
}

// ── Coherence ring ─────────────────────────────────────────────────────────
function CoherenceRing({ score }: { score: number }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  const { color, bg, label } =
    score >= 75 ? { color: "#4ade80", bg: "#4ade8018", label: "High Coherence" }
    : score >= 50 ? { color: "#fbbf24", bg: "#fbbf2418", label: "Partial Alignment" }
    : { color: "#c084fc", bg: "#c084fc18", label: "Emotionally Complex" };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-20 h-20">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color}80)`, transition: "stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ backgroundColor: bg, borderRadius: "50%" }}>
          <span className="text-xl font-bold leading-none" style={{ color }}>{score}</span>
          <span className="text-[8px] text-muted-foreground/60 leading-none mt-0.5">/ 100</span>
        </div>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color }}>{label}</span>
    </div>
  );
}

// ── Session summary card ───────────────────────────────────────────────────
function VoiceSummaryCard({
  summary, persona, messageCount, onClose, onNewSession,
}: {
  summary: VoiceSummary;
  persona: Persona;
  messageCount: number;
  onClose: () => void;
  onNewSession: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-background/95 backdrop-blur-md overflow-y-auto">
      <div className="flex-none flex items-center justify-between px-5 py-4 border-b border-white/8">
        <div>
          <p className="text-sm font-bold text-foreground">Session Complete</p>
          <p className="text-xs text-muted-foreground mt-0.5">{persona.emoji} {persona.label} · {messageCount} exchanges</p>
        </div>
        <button onClick={onClose}
          className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground transition-colors text-sm">
          ✕
        </button>
      </div>

      <div className="flex-none flex flex-col items-center py-6 px-5 gap-3">
        <CoherenceRing score={summary.coherenceScore} />
        <div className="text-center">
          <p className="text-xs text-muted-foreground/70 italic">{summary.coherenceNote}</p>
          <p className="text-[9px] text-muted-foreground/40 mt-1">How well your face &amp; voice emotions aligned</p>
        </div>
      </div>

      <div className="flex-none flex flex-col gap-3 px-5 pb-5">
        <div className="rounded-2xl p-4 border border-white/8" style={{ background: `${persona.color}0a` }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs" style={{ backgroundColor: `${persona.color}25` }}>🌊</div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Emotional Arc</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">{summary.emotions}</p>
        </div>

        <div className="rounded-2xl p-4 border border-white/8 bg-white/3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full bg-white/8 flex items-center justify-center text-xs">💬</div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Key Themes</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">{summary.themes}</p>
        </div>

        <div className="rounded-2xl p-4 border bg-gradient-to-br from-primary/8 to-violet-500/5"
          style={{ borderColor: `${persona.color}25` }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs" style={{ backgroundColor: `${persona.color}20` }}>✨</div>
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: `${persona.color}99` }}>Your Takeaway</span>
          </div>
          <p className="text-sm font-medium leading-relaxed" style={{ color: persona.color }}>{summary.takeaway}</p>
        </div>

        <div className="rounded-2xl p-4 border border-white/8 bg-white/2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="text-xs text-muted-foreground/60">Summary &amp; transcript saved to History</span>
          </div>
        </div>
      </div>

      <div className="flex-none px-5 pb-5 flex gap-2.5">
        <button onClick={onClose}
          className="flex-1 py-2.5 rounded-xl bg-white/6 hover:bg-white/10 text-sm font-medium text-muted-foreground transition-colors border border-white/8">
          Back to Voice
        </button>
        <button onClick={onNewSession}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{ backgroundColor: `${persona.color}20`, color: persona.color, boxShadow: `0 0 0 1px ${persona.color}40` }}>
          New Session
        </button>
      </div>
    </div>
  );
}

// ── Pre-connect setup screen ───────────────────────────────────────────────
function SetupScreen({
  persona, gender, voices, selectedVoiceId, configs, selectedConfigId,
  onPersona, onGender, onVoice, onConfig, onStart,
}: {
  persona: Persona;
  gender: Gender;
  voices: EVIVoice[];
  selectedVoiceId: string | null;
  configs: EVIConfig[];
  selectedConfigId: string | null;
  onPersona: (p: Persona) => void;
  onGender: (g: Gender) => void;
  onVoice: (id: string | null) => void;
  onConfig: (id: string | null) => void;
  onStart: () => void;
}) {
  const hasVoices = voices.length > 0;
  const filteredVoices = hasVoices
    ? voices.filter((v) => gender === "neutral" || voiceMatchesGender(v.name, gender))
    : [];
  const displayVoices = filteredVoices.length > 0 ? filteredVoices : voices;
  const noGenderMatch = hasVoices && gender !== "neutral" && filteredVoices.length === 0;

  return (
    <div className="flex flex-col h-full bg-background/60 backdrop-blur-sm">
      {/* Header */}
      <div className="flex-none px-5 pt-5 pb-4 border-b border-white/8">
        <p className="text-sm font-bold text-foreground flex items-center gap-2">
          <span>🎙</span>Configure Voice Session
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">Choose your mode and voice before starting</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {/* Persona */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3">AI Persona</p>
          <div className="grid grid-cols-2 gap-2">
            {PERSONAS.map((p) => {
              const active = p.id === persona.id;
              return (
                <button key={p.id} onClick={() => onPersona(p)}
                  className="flex flex-col items-start gap-1.5 p-3 rounded-2xl text-left transition-all duration-200"
                  style={active
                    ? { backgroundColor: `${p.color}15`, boxShadow: `0 0 0 1.5px ${p.color}, 0 0 16px ${p.glow}` }
                    : { backgroundColor: "rgba(255,255,255,0.03)", boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }}>
                  <span className="text-xl">{p.emoji}</span>
                  <span className="text-xs font-semibold" style={{ color: active ? p.color : "var(--foreground)" }}>
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Voice gender */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3">Voice Gender</p>
          <div className="flex gap-2">
            {GENDER_OPTIONS.map((g) => {
              const active = gender === g.value;
              return (
                <button key={g.value} onClick={() => onGender(g.value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-all ${
                    active
                      ? "bg-primary/20 text-primary shadow-sm shadow-primary/20 ring-1 ring-primary/40"
                      : "bg-white/4 text-muted-foreground hover:text-foreground hover:bg-white/8"
                  }`}>
                  <span className="text-base leading-none">{g.icon}</span>
                  <span className="text-xs">{g.label}</span>
                </button>
              );
            })}
          </div>

          {/* Voice picker (shown when custom voices exist) */}
          {hasVoices ? (
            <div className="mt-3">
              {noGenderMatch ? (
                <p className="text-[11px] text-amber-400/70 bg-amber-500/8 rounded-xl px-3 py-2">
                  No {gender} voices found. Showing all voices.
                </p>
              ) : null}
              <select
                value={selectedVoiceId ?? ""}
                onChange={(e) => onVoice(e.target.value || null)}
                className="w-full mt-2 text-sm rounded-xl bg-white/5 border border-white/10 text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/40">
                <option value="">Default voice</option>
                {displayVoices.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          ) : (
            /* No voices — help text */
            <div className="mt-3 flex flex-col gap-1.5 bg-white/3 rounded-xl px-3.5 py-3 border border-white/8">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Voice gender requires custom voices set up in your Hume account. Your default EVI voice will be used.
              </p>
              <a href="https://platform.hume.ai" target="_blank" rel="noreferrer"
                className="text-[11px] text-primary/80 hover:text-primary underline underline-offset-2 transition-colors w-fit">
                Set up voices at platform.hume.ai →
              </a>
            </div>
          )}
        </div>

        {/* EVI Config (only if multiple) */}
        {configs.length > 1 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3">EVI Configuration</p>
            <select
              value={selectedConfigId ?? ""}
              onChange={(e) => onConfig(e.target.value || null)}
              className="w-full text-sm rounded-xl bg-white/5 border border-white/10 text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/40">
              <option value="">Default config</option>
              {configs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Start button */}
      <div className="flex-none px-5 py-4 border-t border-white/6">
        <button onClick={onStart}
          className="w-full py-3 rounded-2xl text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99]"
          style={{
            backgroundColor: `${persona.color}22`,
            color: persona.color,
            boxShadow: `0 0 0 1.5px ${persona.color}, 0 0 20px ${persona.glow}`,
          }}>
          <span className="text-base">{persona.emoji}</span>
          Start {persona.label} Session
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </button>
        <p className="text-[10px] text-center text-muted-foreground/40 mt-2">
          Microphone will activate when you click Start
        </p>
      </div>
    </div>
  );
}

// ── Dual FFT visualizer ────────────────────────────────────────────────────
function DualFftVisualizer({
  micFft, speakerFft, isPlaying, persona,
}: { micFft: number[]; speakerFft: number[]; isPlaying: boolean; persona: Persona }) {
  const bars = 24;
  const activeArr = isPlaying ? speakerFft : micFft;
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
            <div key={i} className="w-[3.5px] rounded-full"
              style={{ height: `${h}px`, backgroundColor: color, opacity: hasSignal ? 0.5 + raw * 0.5 : 0.15, transition: "height 80ms ease-out" }} />
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/60 leading-none">
        {isPlaying ? `${persona.emoji} EVI is speaking…` : hasSignal ? "🎙 Listening…" : "🎙 Speak naturally"}
      </p>
    </div>
  );
}

// ── Compact in-session controls (persona + voice) ──────────────────────────
function SessionControls({
  persona, gender, voices, selectedVoiceId,
  onPersonaChange, onGenderChange, onVoiceChange,
}: {
  persona: Persona;
  gender: Gender;
  voices: EVIVoice[];
  selectedVoiceId: string | null;
  onPersonaChange: (p: Persona) => void;
  onGenderChange: (g: Gender) => void;
  onVoiceChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-white/6">
      {/* Persona pills row */}
      <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-1 overflow-x-auto scrollbar-none">
        {PERSONAS.map((p) => {
          const active = p.id === persona.id;
          return (
            <button key={p.id} onClick={() => onPersonaChange(p)}
              className="flex-none flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap"
              style={active
                ? { backgroundColor: `${p.color}18`, color: p.color, boxShadow: `0 0 0 1.5px ${p.color}, 0 0 8px ${p.glow}` }
                : { backgroundColor: "transparent", color: "var(--muted-foreground)", boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }}>
              <span>{p.emoji}</span><span>{p.label}</span>
            </button>
          );
        })}

        {/* Voice settings toggle */}
        <button onClick={() => setOpen((o) => !o)}
          className={`flex-none ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-medium transition-all ${
            open ? "bg-primary/15 text-primary" : "bg-white/5 text-muted-foreground hover:text-foreground"
          }`}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
          Voice
        </button>
      </div>

      {/* Voice panel (collapsible) */}
      {open && (
        <div className="px-4 pb-3 flex flex-col gap-2">
          {/* Gender toggle */}
          <div className="flex gap-1.5">
            {GENDER_OPTIONS.map((g) => {
              const active = gender === g.value;
              return (
                <button key={g.value} onClick={() => onGenderChange(g.value)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    active ? "bg-primary/20 text-primary ring-1 ring-primary/30" : "bg-white/5 text-muted-foreground hover:text-foreground"
                  }`}>
                  <span className="text-sm leading-none">{g.icon}</span>
                  <span>{g.label}</span>
                </button>
              );
            })}
          </div>

          {/* Voice select or help */}
          {voices.length > 0 ? (
            <div className="flex gap-2 items-center">
              <select
                value={selectedVoiceId ?? ""}
                onChange={(e) => onVoiceChange(e.target.value || null)}
                className="flex-1 text-[11px] rounded-lg bg-white/5 border border-white/10 text-foreground px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40">
                <option value="">Default voice</option>
                {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <span className="text-[10px] text-amber-400/70 bg-amber-500/10 px-2 py-1 rounded-lg whitespace-nowrap">
                Takes effect next reply
              </span>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
              Gender voice switching requires custom voices in your{" "}
              <a href="https://platform.hume.ai" target="_blank" rel="noreferrer" className="text-primary/70 hover:text-primary underline">
                Hume account
              </a>.
            </p>
          )}
        </div>
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
      <span className="text-[10px] text-green-400 font-medium">Live</span>
    </div>
  );
  if (readyState === VoiceReadyState.CONNECTING) return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/12 border border-amber-500/20">
      <div className="w-3 h-3 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin" />
      <span className="text-[10px] text-amber-400 font-medium">Connecting…</span>
    </div>
  );
  return null;
}

// ── Inner component (must be child of VoiceProvider) ──────────────────────
function VoiceModeInner({
  apiKey, configs, voices, onVoiceEmotion, sessionId, faceEmotionCounts,
}: {
  apiKey: string; configs: EVIConfig[]; voices: EVIVoice[];
  onVoiceEmotion: Props["onVoiceEmotion"];
  sessionId: number | null; faceEmotionCounts: Record<string, number>;
}) {
  const {
    connect, disconnect, readyState, messages,
    fft, micFft, isPlaying, sendSessionSettings, status, error, clearMessages,
  } = useVoice();

  // ── State ───────────────────────────────────────────────────────────────
  const [hasStarted, setHasStarted]           = useState(false);
  const [transcript, setTranscript]           = useState<TranscriptEntry[]>([]);
  const [persona, setPersona]                 = useState<Persona>(PERSONAS[0]);
  const [gender, setGender]                   = useState<Gender>("neutral");
  const [selectedConfigId, setSelectedConfig] = useState<string | null>(configs[0]?.id ?? null);
  const [selectedVoiceId, setSelectedVoice]   = useState<string | null>(null);
  const [voiceEmotionCounts, setVoiceEmotionCounts] = useState<Record<string, number>>({});
  const [summary, setSummary]                 = useState<VoiceSummary | null>(null);
  const [summaryLoading, setSummaryLoading]   = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  const isOpen = readyState === VoiceReadyState.OPEN;
  const isConnecting = readyState === VoiceReadyState.CONNECTING;
  const userMsgCount = transcript.filter((t) => t.role === "user").length;

  // ── Connection ──────────────────────────────────────────────────────────
  const doConnect = useCallback(async (opts: {
    persona: Persona; configId: string | null; voiceId: string | null;
  }) => {
    await connect({
      auth: { type: "apiKey", value: apiKey },
      ...(opts.configId ? { configId: opts.configId } : {}),
      sessionSettings: {
        type: "session_settings" as const,
        systemPrompt: opts.persona.systemPrompt,
        ...(opts.voiceId ? { voiceId: opts.voiceId } : {}),
      },
      audioConstraints: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  }, [apiKey, connect]);

  // Cleanup on unmount
  useEffect(() => { return () => { disconnect(); }; }, [disconnect]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    setHasStarted(true);
    await doConnect({ persona, configId: selectedConfigId, voiceId: selectedVoiceId });
  }, [doConnect, persona, selectedConfigId, selectedVoiceId]);

  // Persona change mid-session — reconnect with new prompt
  const handlePersonaChange = useCallback(async (p: Persona) => {
    if (p.id === persona.id) return;
    setPersona(p);
    if (!hasStarted) return;
    clearMessages(); setTranscript([]); prevLenRef.current = 0;
    if (isOpen) await disconnect();
    await doConnect({ persona: p, configId: selectedConfigId, voiceId: selectedVoiceId });
  }, [persona.id, hasStarted, isOpen, disconnect, doConnect, selectedConfigId, selectedVoiceId, clearMessages]);

  // Voice ID change — update live via sendSessionSettings (takes effect on next EVI reply)
  const handleVoiceChange = useCallback((voiceId: string | null) => {
    setSelectedVoice(voiceId);
    if (isOpen && voiceId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sendSessionSettings({ voiceId } as any);
    }
  }, [isOpen, sendSessionSettings]);

  // Gender change — auto-match a voice if available, else just note the preference
  const handleGenderChange = useCallback((g: Gender) => {
    setGender(g);
    if (g === "neutral") { handleVoiceChange(null); return; }
    if (voices.length === 0) return; // no voices, nothing to switch
    const match = voices.find((v) => voiceMatchesGender(v.name, g));
    handleVoiceChange(match?.id ?? null);
  }, [voices, handleVoiceChange]);

  const handleConfigChange = useCallback(async (configId: string | null) => {
    setSelectedConfig(configId);
    if (!hasStarted) return;
    clearMessages(); setTranscript([]); prevLenRef.current = 0;
    if (isOpen) await disconnect();
    await doConnect({ persona, configId, voiceId: selectedVoiceId });
  }, [hasStarted, isOpen, disconnect, doConnect, persona, selectedVoiceId, clearMessages]);

  // End session + generate summary
  const handleEndSession = useCallback(async () => {
    if (!sessionId || transcript.length === 0) return;
    setSummaryLoading(true);
    if (isOpen) { try { await disconnect(); } catch { /* ignore */ } }
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${persona.emoji} ${persona.label} voice session`,
          dominantEmotion: Object.entries(voiceEmotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        }),
      });
      const res = await fetch(`/api/sessions/${sessionId}/voice-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceEmotionCounts, faceEmotionCounts }),
      });
      const data = await res.json() as { summary: VoiceSummary | null };
      if (data.summary) setSummary(data.summary);
    } catch { /* non-critical */ }
    setSummaryLoading(false);
  }, [sessionId, transcript.length, isOpen, disconnect, persona, voiceEmotionCounts, faceEmotionCounts]);

  // ── Message parsing → transcript + voice emotion counts ─────────────────
  useEffect(() => {
    const jsonMsgs = messages.filter(
      (m): m is JSONMessage =>
        !("code" in m) &&
        (m as { type?: string }).type !== "socket_connected" &&
        (m as { type?: string }).type !== "socket_disconnected" &&
        (m as { type?: string }).type !== "session_settings",
    );

    const entries: TranscriptEntry[] = [];
    const vCounts: Record<string, number> = {};

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
          const dom = getDominantEmotion(scores);
          onVoiceEmotion(dom.label, scores);
          vCounts[dom.label] = (vCounts[dom.label] ?? 0) + 1;
        }
      } else if (type === "assistant_message") {
        const content: string = mm.message?.content ?? "";
        if (!content.trim()) continue;
        entries.push({ id: `a-${String(mm.receivedAt)}`, role: "assistant", content, receivedAt: mm.receivedAt ?? new Date() });
      }
    }
    setTranscript(entries);
    setVoiceEmotionCounts(vCounts);
  }, [messages, onVoiceEmotion]);

  // Persist new transcript entries
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

  // ── Pre-connect setup screen ─────────────────────────────────────────────
  if (!hasStarted) {
    return (
      <SetupScreen
        persona={persona} gender={gender} voices={voices}
        selectedVoiceId={selectedVoiceId} configs={configs} selectedConfigId={selectedConfigId}
        onPersona={setPersona} onGender={setGender}
        onVoice={setSelectedVoice} onConfig={setSelectedConfig}
        onStart={handleStart}
      />
    );
  }

  // ── Active session view ──────────────────────────────────────────────────
  return (
    <div className="relative flex flex-col h-full bg-background/60 backdrop-blur-sm">

      {/* Summary overlay */}
      {summary && (
        <VoiceSummaryCard
          summary={summary} persona={persona} messageCount={userMsgCount}
          onClose={() => setSummary(null)}
          onNewSession={() => {
            setSummary(null); clearMessages(); setTranscript([]);
            setVoiceEmotionCounts({}); prevLenRef.current = 0; setHasStarted(false);
          }}
        />
      )}

      {/* Generating overlay */}
      {summaryLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/90 backdrop-blur-sm">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
            <div className="absolute inset-2 rounded-full border border-violet-400/20 border-t-violet-400 animate-spin" style={{ animationDuration: "1.5s", animationDirection: "reverse" }} />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">Analysing your session…</p>
            <p className="text-xs text-muted-foreground mt-1">Comparing face &amp; voice emotions · Building insights</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-white/8 bg-black/20">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span>🎙</span>Voice Session
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{persona.emoji} {persona.label}</p>
        </div>
        <div className="flex items-center gap-2">
          {configs.length > 1 && (
            <select value={selectedConfigId ?? ""} onChange={(e) => handleConfigChange(e.target.value || null)}
              className="text-[10px] rounded-lg bg-white/5 border border-white/10 text-muted-foreground px-2 py-1 focus:outline-none max-w-[110px] truncate">
              <option value="">Default config</option>
              {configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <StatusBadge readyState={readyState} error={error} />
        </div>
      </div>

      {/* Compact in-session controls */}
      <SessionControls
        persona={persona} gender={gender} voices={voices} selectedVoiceId={selectedVoiceId}
        onPersonaChange={handlePersonaChange} onGenderChange={handleGenderChange} onVoiceChange={handleVoiceChange}
      />

      {/* FFT visualizer */}
      {isOpen && (
        <div className="flex-none border-b border-white/6 bg-black/10" style={{ borderBottom: `1px solid ${persona.color}18` }}>
          <DualFftVisualizer micFft={micFft} speakerFft={fft} isPlaying={isPlaying} persona={persona} />
        </div>
      )}

      {/* Error state */}
      {status.value === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center text-2xl">🎙</div>
          <div>
            <p className="text-sm font-semibold text-foreground">Connection failed</p>
            <p className="text-xs text-muted-foreground/60 mt-2 max-w-[240px]">Check your Hume API key at platform.hume.ai</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setHasStarted(false); }}
              className="px-4 py-2 rounded-xl bg-white/6 text-muted-foreground text-xs font-medium hover:bg-white/10 transition-colors">
              Back to Setup
            </button>
            <button onClick={() => doConnect({ persona, configId: selectedConfigId, voiceId: selectedVoiceId })}
              className="px-4 py-2 rounded-xl bg-primary/15 text-primary text-xs font-medium hover:bg-primary/25 transition-colors">
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Connecting state */}
      {isConnecting && status.value !== "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">Connecting…</p>
            <p className="text-xs text-muted-foreground mt-1">{persona.emoji} {persona.label} · Starting microphone</p>
          </div>
        </div>
      )}

      {/* Transcript */}
      {(isOpen || transcript.length > 0) && status.value !== "error" && (
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
          {transcript.length === 0 && isOpen && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-8">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                style={{ backgroundColor: `${persona.color}18`, boxShadow: `0 0 0 1px ${persona.color}30` }}>
                {persona.emoji}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{persona.label} is listening</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                  Speak naturally — EVI hears and responds with empathic voice
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
                    <p className="text-[9px] text-muted-foreground/50 mb-0.5 text-right">Vocal emotions</p>
                    <EmotionChips scores={entry.emotions} />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Footer */}
      <div className="flex-none border-t border-white/6 px-4 py-2 flex items-center justify-between bg-black/15"
        style={{ borderTop: `1px solid ${persona.color}18` }}>
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-1 rounded-full opacity-60" style={{ backgroundColor: persona.color }} />
          <span className="text-[10px] text-muted-foreground/40">EVI · face-api.js</span>
        </div>
        {userMsgCount > 0 && !summaryLoading && (
          <button onClick={handleEndSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all hover:scale-[1.02]"
            style={{ backgroundColor: `${persona.color}18`, color: persona.color, boxShadow: `0 0 0 1px ${persona.color}35` }}>
            <span>✦</span>End &amp; Summarise
          </button>
        )}
        {isOpen && userMsgCount === 0 && (
          <span className="text-[10px] text-muted-foreground/30">Mic active</span>
        )}
      </div>
    </div>
  );
}

// ── Public wrapper ─────────────────────────────────────────────────────────
export default function HumeVoiceMode({ onVoiceEmotion, sessionId, faceEmotionCounts }: Props) {
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
        <p className="text-xs text-muted-foreground max-w-[220px]">Set HUME_API_KEY in Replit Secrets.</p>
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
        apiKey={humeConfig.apiKey} configs={humeConfig.configs} voices={humeConfig.voices}
        onVoiceEmotion={onVoiceEmotion} sessionId={sessionId} faceEmotionCounts={faceEmotionCounts}
      />
    </VoiceProvider>
  );
}
