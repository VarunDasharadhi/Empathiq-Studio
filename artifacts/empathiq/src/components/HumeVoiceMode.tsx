import { useEffect, useRef, useState, useCallback } from "react";

// ── Browser Speech API types ────────────────────────────────────────────────
interface SREvent extends Event {
  results: { [i: number]: { isFinal: boolean; [j: number]: { transcript: string } }; length: number };
  resultIndex: number;
}
interface SRInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
declare global {
  interface Window {
    SpeechRecognition: new () => SRInstance;
    webkitSpeechRecognition: new () => SRInstance;
  }
}

// ── Personas ────────────────────────────────────────────────────────────────
interface Persona { id: string; label: string; emoji: string; color: string; glow: string; systemPrompt: string; }

const PERSONAS: Persona[] = [
  { id: "therapist", label: "Therapist", emoji: "🧠", color: "#818cf8", glow: "rgba(129,140,248,0.5)",
    systemPrompt: "You are a compassionate therapist. Speak gently and validate feelings first. Ask one open question at a time. Be calm and non-judgmental. Never diagnose. Keep voice responses to 2-3 sentences." },
  { id: "dating", label: "Dating Coach", emoji: "💘", color: "#f472b6", glow: "rgba(244,114,182,0.5)",
    systemPrompt: "You are a confident and playful dating coach. Be direct, fun, a little cheeky. Help build genuine confidence. Keep it real, short, and punchy — 2-3 sentences for voice." },
  { id: "sales", label: "Sales Coach", emoji: "💼", color: "#34d399", glow: "rgba(52,211,153,0.5)",
    systemPrompt: "You are a sharp sales coach. Be direct, tactical, motivating. Push them to think bigger. Keep responses concise for voice — 2-3 sentences." },
  { id: "meditation", label: "Meditation", emoji: "🧘", color: "#67e8f9", glow: "rgba(103,232,249,0.5)",
    systemPrompt: "You are a peaceful meditation guide. Speak very softly with gentle pauses. Offer breathwork and grounding. Language is spacious and calming. Keep responses short — 2-3 sentences." },
  { id: "smart-glasses", label: "Smart Glasses", emoji: "🥽", color: "#a78bfa", glow: "rgba(167,139,250,0.5)",
    systemPrompt: "You are a real-time social assistant in the user's ear. Give short whispered actionable coaching — what to say, how to respond. Be fast and precise — 1-2 sentences max." },
  { id: "anger-release", label: "Anger Release", emoji: "😤", color: "#f87171", glow: "rgba(248,113,113,0.5)",
    systemPrompt: "You are a safe space to vent. Validate everything without judgment. Keep responses short and grounding — 2-3 sentences." },
  { id: "focus-coach", label: "Focus Coach", emoji: "🎯", color: "#fbbf24", glow: "rgba(251,191,36,0.5)",
    systemPrompt: "You are an intense focus coach. Help cut through distraction. Be structured and energizing — 2-3 sentences for voice." },
  { id: "sleep-guide", label: "Sleep Guide", emoji: "🌙", color: "#818cf8", glow: "rgba(129,140,248,0.4)",
    systemPrompt: "You are a soothing sleep guide. Use a slow, calming voice. Guide toward relaxation. Keep responses gentle and brief — 2-3 sentences." },
  { id: "confidence", label: "Confidence", emoji: "⚡", color: "#fb923c", glow: "rgba(251,146,60,0.5)",
    systemPrompt: "You are an enthusiastic confidence coach. Be bold and affirming. Challenge limiting beliefs. Keep it energizing and brief — 2-3 sentences." },
];

// ── Voice helpers ────────────────────────────────────────────────────────────
function getSpeechParams(emotion: string | null, modeId: string): { rate: number; pitch: number } {
  if (modeId === "meditation" || modeId === "sleep-guide") return { rate: 0.75, pitch: 0.9 };
  switch (emotion) {
    case "sad":     return { rate: 0.85, pitch: 0.85 };
    case "happy":   return { rate: 1.05, pitch: 1.1 };
    case "angry":   return { rate: 0.9,  pitch: 0.95 };
    case "fearful": return { rate: 0.9,  pitch: 0.9 };
    default:        return { rate: 1.0,  pitch: 1.0 };
  }
}

function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const preferred = [
    "Samantha", "Google UK English Female", "Microsoft Aria Online (Natural)",
    "Microsoft Jenny Online (Natural)", "Microsoft Aria", "Karen", "Moira",
    "Fiona", "Google US English", "Victoria",
  ];
  for (const name of preferred) {
    const v = voices.find((v) => v.name.includes(name));
    if (v) return v;
  }
  return (
    voices.find((v) => v.lang.startsWith("en-") && !v.name.toLowerCase().includes("compact")) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    voices[0] ?? null
  );
}

function getDominantEmotion(counts: Record<string, number>): string | null {
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// ── Sound wave animation ─────────────────────────────────────────────────────
function SoundWave({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-0.5 h-5">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="w-0.5 rounded-full"
          style={{ backgroundColor: color, animation: `soundBar 1.2s ease-in-out ${i * 0.15}s infinite`, height: "100%" }}
        />
      ))}
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────
type VoiceState = "idle" | "listening" | "processing" | "speaking";
interface VoiceMsg { id: string; role: "user" | "assistant"; content: string; }

interface Props {
  onVoiceEmotion: (emotion: string | null, scores: Record<string, number> | null) => void;
  sessionId: number | null;
  faceEmotionCounts: Record<string, number>;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function HumeVoiceMode({ faceEmotionCounts }: Props) {
  const [activePersona, setActivePersona] = useState<Persona>(PERSONAS[0]);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [messages, setMessages] = useState<VoiceMsg[]>([]);
  const [interimText, setInterimText] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [speechSupported] = useState(
    () => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );

  const recognitionRef = useRef<SRInstance | null>(null);
  const voiceStateRef = useRef<VoiceState>("idle");
  const messagesRef = useRef<VoiceMsg[]>([]);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const faceCountsRef = useRef(faceEmotionCounts);
  const personaRef = useRef(activePersona);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { voicesRef.current = voices; }, [voices]);
  useEffect(() => { faceCountsRef.current = faceEmotionCounts; }, [faceEmotionCounts]);
  useEffect(() => { personaRef.current = activePersona; }, [activePersona]);

  // Load TTS voices
  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  // Auto-scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, interimText]);

  // Cleanup
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      recognitionRef.current?.abort();
    };
  }, []);

  const speakText = useCallback((text: string, emotion: string | null, modeId: string) => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const { rate, pitch } = getSpeechParams(emotion, modeId);
    const voice = pickBestVoice(voicesRef.current);
    if (voice) utter.voice = voice;
    utter.rate = rate;
    utter.pitch = pitch;
    utter.volume = 1;
    setVoiceState("speaking");
    utter.onend = () => setVoiceState("idle");
    utter.onerror = () => setVoiceState("idle");
    window.speechSynthesis.speak(utter);
  }, []);

  const sendToClaudeAndSpeak = useCallback(async (text: string) => {
    const emotion = getDominantEmotion(faceCountsRef.current);
    const persona = personaRef.current;
    const userMsg: VoiceMsg = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setVoiceState("processing");

    const apiMessages = [...messagesRef.current, userMsg].map((m) => ({
      role: m.role,
      content: m.role === "user" && m.id === userMsg.id
        ? `[EMOTION: ${emotion ?? "neutral"}] ${m.content}`
        : m.content,
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, systemPrompt: persona.systemPrompt }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json() as { response: string };
      const assistantMsg: VoiceMsg = { id: `a-${Date.now()}`, role: "assistant", content: data.response };
      setMessages((prev) => [...prev, assistantMsg]);
      speakText(data.response, emotion, persona.id);
    } catch {
      setError("Could not reach Claude. Check your connection.");
      setVoiceState("idle");
    }
  }, [speakText]);

  const startListening = useCallback(() => {
    if (voiceStateRef.current !== "idle") return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError("Speech recognition not supported. Try Chrome or Safari."); return; }
    setError(null);
    setInterimText("");
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setInterimText(interim || "");
      if (final.trim()) {
        setInterimText("");
        recognitionRef.current = null;
        sendToClaudeAndSpeak(final.trim());
      }
    };
    rec.onerror = (e) => {
      const code = e.error;
      if (code !== "no-speech") setError(`Mic error: ${code ?? "unknown"}`);
      setVoiceState("idle");
      setInterimText("");
      recognitionRef.current = null;
    };
    rec.onend = () => {
      if (voiceStateRef.current === "listening") setVoiceState("idle");
      setInterimText("");
      recognitionRef.current = null;
    };
    recognitionRef.current = rec;
    setVoiceState("listening");
    try { rec.start(); } catch { setError("Could not start microphone."); setVoiceState("idle"); }
  }, [sendToClaudeAndSpeak]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setVoiceState("idle");
    setInterimText("");
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setVoiceState("idle");
  }, []);

  const handleMicClick = useCallback(() => {
    if (voiceState === "idle") startListening();
    else if (voiceState === "listening") stopListening();
    else if (voiceState === "speaking") stopSpeaking();
  }, [voiceState, startListening, stopListening, stopSpeaking]);

  const handlePersonaChange = (persona: Persona) => {
    if (persona.id === activePersona.id) return;
    window.speechSynthesis.cancel();
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setActivePersona(persona);
    setMessages([]);
    setVoiceState("idle");
    setInterimText("");
    setError(null);
  };

  const micColor =
    voiceState === "listening"  ? "#4ade80" :
    voiceState === "speaking"   ? "#818cf8" :
    voiceState === "processing" ? "#fb923c" :
    activePersona.color;

  const statusText =
    voiceState === "idle"       ? "Tap to speak" :
    voiceState === "listening"  ? "Listening…" :
    voiceState === "processing" ? "Thinking…" :
    "Speaking…";

  return (
    <div className="flex flex-col h-full bg-background/60 backdrop-blur-sm">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-5 py-3.5 border-b border-white/8 bg-black/20">
        <div>
          <p className="text-sm font-semibold text-foreground">Voice Mode</p>
          <p className="text-xs text-muted-foreground mt-0.5">Web Speech + Claude</p>
        </div>
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: `${micColor}18`, color: micColor, boxShadow: `0 0 0 1px ${micColor}35` }}
        >
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: micColor }} />
          {statusText}
        </div>
      </div>

      {/* Persona selector */}
      <div className="flex-none px-4 pt-3 pb-2 flex gap-2 overflow-x-auto scrollbar-none">
        {PERSONAS.map((p) => {
          const isActive = p.id === activePersona.id;
          return (
            <button
              key={p.id}
              onClick={() => handlePersonaChange(p)}
              className="flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 whitespace-nowrap"
              style={isActive
                ? { backgroundColor: `${p.color}18`, color: p.color, boxShadow: `0 0 0 1.5px ${p.color}, 0 0 12px ${p.glow}`, animation: "modePulse 2.5s ease-in-out infinite" }
                : { backgroundColor: "transparent", color: "var(--muted-foreground)", boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }
              }
            >
              <span>{p.emoji}</span><span>{p.label}</span>
            </button>
          );
        })}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-3 min-h-0">
        {messages.length === 0 && !interimText && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-10 opacity-60">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{ backgroundColor: `${activePersona.color}15`, boxShadow: `0 0 0 1px ${activePersona.color}25` }}
            >
              {activePersona.emoji}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{activePersona.label} ready</p>
              <p className="text-xs text-muted-foreground mt-1">Tap the mic below and start speaking</p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
              style={msg.role === "assistant"
                ? { backgroundColor: `${activePersona.color}12`, color: "var(--foreground)", boxShadow: `0 0 0 1px ${activePersona.color}25` }
                : { backgroundColor: "rgba(255,255,255,0.07)", color: "var(--foreground)" }
              }
            >
              {msg.content}
            </div>
          </div>
        ))}

        {interimText && (
          <div className="flex justify-end">
            <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed bg-white/4 text-muted-foreground italic">
              {interimText}…
            </div>
          </div>
        )}

        {voiceState === "processing" && (
          <div className="flex justify-start">
            <div
              className="px-4 py-3 rounded-2xl flex items-center gap-1.5"
              style={{ backgroundColor: `${activePersona.color}12`, boxShadow: `0 0 0 1px ${activePersona.color}25` }}
            >
              {[0, 0.2, 0.4].map((delay, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: activePersona.color, animation: `dot-bounce 1.2s ease-in-out ${delay}s infinite` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="flex-none mx-4 mb-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Mic control area */}
      <div className="flex-none px-6 pb-6 pt-3 flex flex-col items-center gap-3 border-t border-white/5">
        {voiceState === "speaking" && <SoundWave color={activePersona.color} />}

        <button
          onClick={handleMicClick}
          disabled={!speechSupported || voiceState === "processing"}
          className="relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none disabled:opacity-40"
          style={{
            backgroundColor: `${micColor}20`,
            boxShadow: voiceState === "listening"
              ? `0 0 0 0 ${micColor}60, 0 0 28px ${micColor}50`
              : `0 0 0 1.5px ${micColor}50`,
            animation: voiceState === "listening" ? "modePulse 1.5s ease-in-out infinite" : "none",
          }}
        >
          {voiceState === "processing" ? (
            <div className="w-6 h-6 rounded-full border-2 border-transparent border-t-orange-400 animate-spin" />
          ) : voiceState === "speaking" ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: micColor }}>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: micColor }}>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">{statusText}</p>
          {voiceState === "speaking" && (
            <button
              onClick={stopSpeaking}
              className="text-[10px] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              Stop
            </button>
          )}
        </div>

        {!speechSupported && (
          <p className="text-xs text-destructive/70 text-center max-w-[200px]">
            Speech recognition not supported. Use Chrome or Safari.
          </p>
        )}
      </div>
    </div>
  );
}
