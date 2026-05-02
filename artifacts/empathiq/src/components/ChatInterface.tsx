import { useState, useRef, useEffect, useCallback } from "react";
import type { Emotion } from "@/App";

interface Coherence {
  score: number;        // 0–1
  label: string;
  mismatch: boolean;
  textSentiment: "positive" | "negative" | "neutral";
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  emotion?: Emotion;
  coherence?: Coherence;
}

interface Mode {
  id: string;
  label: string;
  emoji: string;
  systemPrompt: string;
  color: string;
  glow: string;
  starters: string[];
}

const MODES: Mode[] = [
  {
    id: "therapist",
    label: "Therapist",
    emoji: "🧠",
    color: "#818cf8",
    glow: "rgba(129,140,248,0.45)",
    systemPrompt:
      "You are EmpathIQ acting as a compassionate, gentle therapist. Use CBT-style techniques: validate feelings first, then gently explore thoughts and patterns. Ask one open question at a time. Never diagnose. Be warm, non-judgmental, and give space for the person to reflect. Keep responses concise and human.",
    starters: ["How are you feeling today?", "I need someone to talk to.", "I've been struggling lately."],
  },
  {
    id: "dating",
    label: "Dating Coach",
    emoji: "💘",
    color: "#f472b6",
    glow: "rgba(244,114,182,0.45)",
    systemPrompt:
      "You are EmpathIQ acting as a confident, playful dating coach. Read the user's emotional energy and give sharp, honest advice about attraction, connection, and relationships. Be fun and a little cheeky — never preachy. Help them understand their own patterns and build genuine confidence. Keep it real, not cheesy.",
    starters: ["There's someone I like but I don't know what to say.", "How do I seem more confident?", "Why do I keep attracting the wrong people?"],
  },
  {
    id: "sales",
    label: "Sales Coach",
    emoji: "💼",
    color: "#34d399",
    glow: "rgba(52,211,153,0.45)",
    systemPrompt:
      "You are EmpathIQ acting as a sharp, energetic sales coach. Help the user handle objections, close deals, build rapport, and sharpen their pitch. Be direct, tactical, and motivating. Use real-world sales frameworks when helpful. Push them to think bigger and execute better.",
    starters: ["My prospect keeps ghosting me.", "How do I handle price objections?", "Help me tighten my pitch."],
  },
  {
    id: "meditation",
    label: "Meditation",
    emoji: "🧘",
    color: "#67e8f9",
    glow: "rgba(103,232,249,0.45)",
    systemPrompt:
      "You are EmpathIQ acting as a calm, grounding meditation guide. Speak slowly and softly. Offer breathwork exercises, body scans, grounding techniques, and mindfulness prompts tailored to the user's current emotional state. Use gentle, spacious language. Pause with ellipses. Help them arrive in the present moment.",
    starters: ["I'm feeling anxious and need to calm down.", "Guide me through a quick breathing exercise.", "Help me clear my mind."],
  },
  {
    id: "smart-glasses",
    label: "Smart Glasses",
    emoji: "🥽",
    color: "#a78bfa",
    glow: "rgba(167,139,250,0.45)",
    systemPrompt:
      "You are a real-time social assistant. The user is wearing smart glasses and seeing another person. Analyse the described scene and give whispered, short, actionable coaching — what to say, how to respond, what the other person's emotion likely means. Be a silent expert in their ear.",
    starters: ["I'm about to meet someone new.", "They seem upset — what do I say?", "Help me read this person."],
  },
  {
    id: "anger-release",
    label: "Anger Release",
    emoji: "😤",
    color: "#f87171",
    glow: "rgba(248,113,113,0.45)",
    systemPrompt:
      "You are a safe space. The user needs to vent. Let them speak freely. Validate everything. Never judge. Reflect their intensity back calmly. Help them process and decompress.",
    starters: ["I just need to vent.", "I'm so frustrated right now.", "Everything is going wrong."],
  },
  {
    id: "focus-coach",
    label: "Focus Coach",
    emoji: "🎯",
    color: "#fbbf24",
    glow: "rgba(251,191,36,0.45)",
    systemPrompt:
      "You are a productivity coach. Keep responses short and sharp. Help the user stay in flow, eliminate distraction, and execute. Match their energy — push when they're slow, calm when they're overwhelmed.",
    starters: ["I can't focus today.", "Help me prioritise my tasks.", "I keep getting distracted."],
  },
  {
    id: "sleep-guide",
    label: "Sleep Guide",
    emoji: "🌙",
    color: "#818cf8",
    glow: "rgba(99,102,241,0.45)",
    systemPrompt:
      "You are a sleep companion. Voice is slow, warm, and hypnotic. Guide the user toward rest using breathing exercises, body scans, and calming storytelling. Never rush. Speak like dusk.",
    starters: ["I can't fall asleep.", "Guide me through a body scan.", "Tell me something calming."],
  },
  {
    id: "confidence-booster",
    label: "Confidence Booster",
    emoji: "💪",
    color: "#fb923c",
    glow: "rgba(251,146,60,0.45)",
    systemPrompt:
      "You are a hype coach. Read the user's energy — if they're low, lift them. Speak with conviction, warmth, and power. Help them step into their best self before a big moment.",
    starters: ["I have a big moment coming up.", "I'm feeling really low on confidence.", "Hype me up."],
  },
];

// ── Coherence engine ──────────────────────────────────────────────────────────
const POSITIVE_WORDS = [
  "fine", "good", "great", "happy", "amazing", "wonderful", "excited", "love",
  "joy", "ok", "okay", "well", "better", "best", "awesome", "fantastic",
  "excellent", "positive", "glad", "pleased", "content", "satisfied", "calm",
  "peaceful", "grateful", "optimistic", "hopeful", "energetic", "confident",
];
const NEGATIVE_WORDS = [
  "bad", "sad", "hurt", "scared", "angry", "terrible", "awful", "depressed",
  "cry", "crying", "upset", "worried", "anxious", "stressed", "miserable",
  "hopeless", "overwhelmed", "struggling", "pain", "suffering", "lonely",
  "alone", "lost", "confused", "tired", "exhausted", "broken", "empty",
  "numb", "scared", "fear", "hate", "horrible", "worthless", "stuck",
];

const EMOTION_VALENCE: Record<string, "positive" | "negative" | "neutral"> = {
  happy: "positive",
  surprised: "positive",
  neutral: "neutral",
  sad: "negative",
  angry: "negative",
  fearful: "negative",
  disgusted: "negative",
};

function getTextSentiment(text: string): "positive" | "negative" | "neutral" {
  const lower = text.toLowerCase();
  const pos = POSITIVE_WORDS.filter((w) => lower.includes(w)).length;
  const neg = NEGATIVE_WORDS.filter((w) => lower.includes(w)).length;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

function computeCoherence(text: string, emotion: Emotion): Coherence {
  const textSentiment = getTextSentiment(text);

  if (!emotion || emotion === "neutral" || textSentiment === "neutral") {
    return { score: 0.65, label: "Neutral", mismatch: false, textSentiment };
  }

  const emotionValence = EMOTION_VALENCE[emotion];
  if (textSentiment === emotionValence) {
    return { score: 1, label: "Aligned", mismatch: false, textSentiment };
  }
  return { score: 0.18, label: "Mismatch", mismatch: true, textSentiment };
}
// ─────────────────────────────────────────────────────────────────────────────

const EMOTION_LABELS: Record<string, string> = {
  happy: "Happy", sad: "Sad", angry: "Angry",
  fearful: "Fearful", disgusted: "Disgusted",
  surprised: "Surprised", neutral: "Neutral",
};
const EMOTION_COLORS: Record<string, string> = {
  happy: "#facc15", sad: "#60a5fa", angry: "#f87171",
  fearful: "#c084fc", disgusted: "#4ade80",
  surprised: "#fb923c", neutral: "#9ca3af",
};

async function saveMessage(
  sessionId: number,
  role: "user" | "assistant",
  content: string,
  emotion?: string | null,
) {
  try {
    await fetch(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content, emotion: emotion ?? null }),
    });
  } catch { /* non-critical */ }
}

interface SpeechRecognitionEvent extends Event { results: SpeechRecognitionResultList; }
interface SpeechRecognitionErrorEvent extends Event { error: string; }
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean; interimResults: boolean; lang: string;
  start(): void; stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

const SoundWave = ({ color }: { color: string }) => (
  <div className="flex items-center gap-[3px] h-5">
    {[0, 1, 2, 3, 4].map((i) => (
      <div key={i} className="w-[3px] rounded-full sound-bar" style={{ backgroundColor: color, animationDelay: `${i * 0.1}s` }} />
    ))}
  </div>
);

// Coherence ring — animated arc showing score
function CoherenceRing({ score, mismatch, label }: { score: number; mismatch: boolean; label: string }) {
  const r = 10;
  const circ = 2 * Math.PI * r;
  const dash = circ * score;
  const color = mismatch ? "#f59e0b" : score > 0.8 ? "#4ade80" : "#9ca3af";
  return (
    <div className="flex items-center gap-1.5" title={`Emotional coherence: ${label}`}>
      <svg width="26" height="26" viewBox="0 0 26 26">
        <circle cx="13" cy="13" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
        <circle
          cx="13" cy="13" r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 13 13)"
          style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.4s ease" }}
        />
      </svg>
      <span className="text-[10px] font-medium" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

interface Props { currentEmotion: Emotion; sessionId: number | null; }

export default function ChatInterface({ currentEmotion, sessionId }: Props) {
  const [activeMode, setActiveMode] = useState<Mode>(MODES[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [emotionFlashKey, setEmotionFlashKey] = useState(0);
  const [currentCoherence, setCurrentCoherence] = useState<Coherence | null>(null);
  const prevEmotionRef = useRef<Emotion>(null);
  const [speechSupported] = useState(
    () => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const interimRef = useRef("");

  useEffect(() => { setMessages([]); setCurrentCoherence(null); }, [sessionId]);

  useEffect(() => {
    if (currentEmotion !== prevEmotionRef.current && currentEmotion !== null) {
      setEmotionFlashKey((k) => k + 1);
      prevEmotionRef.current = currentEmotion;
    }
  }, [currentEmotion]);

  // Live coherence preview as user types
  useEffect(() => {
    if (input.trim() && currentEmotion) {
      setCurrentCoherence(computeCoherence(input, currentEmotion));
    } else {
      setCurrentCoherence(null);
    }
  }, [input, currentEmotion]);

  const handleModeChange = (mode: Mode) => {
    if (mode.id === activeMode.id) return;
    setActiveMode(mode);
    setMessages([]);
    setInput("");
    setCurrentCoherence(null);
    inputRef.current?.focus();
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isTyping) return;

    const coherence = computeCoherence(text, currentEmotion);
    const emotionTag = currentEmotion ? `[EMOTION: ${currentEmotion}] ` : "";

    // Build the content sent to Claude — include mismatch note when relevant
    let userContent = `${emotionTag}${text}`;
    if (coherence.mismatch && currentEmotion) {
      const emotionLabel = EMOTION_LABELS[currentEmotion]?.toLowerCase() ?? currentEmotion;
      const sentimentLabel = coherence.textSentiment;
      userContent += `\n[COHERENCE NOTE: The user's words sound ${sentimentLabel} but their face shows ${emotionLabel}. If appropriate, gently and briefly acknowledge this gap — don't force it.]`;
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      emotion: currentEmotion,
      coherence,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setCurrentCoherence(null);
    setIsTyping(true);

    if (sessionId) saveMessage(sessionId, "user", text, currentEmotion);

    try {
      const apiMessages = newMessages.map((m, i) => ({
        role: m.role,
        content:
          m.role === "user" && i === newMessages.length - 1
            ? userContent
            : m.role === "user" && m.emotion
              ? `[EMOTION: ${m.emotion}] ${m.content}`
              : m.content,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, systemPrompt: activeMode.systemPrompt }),
      });

      if (!res.ok) throw new Error("API error");
      const data = (await res.json()) as { content: string };
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.content }]);
      if (sessionId) saveMessage(sessionId, "assistant", data.content, null);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: "I'm having trouble connecting right now. Please try again in a moment." },
      ]);
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  }, [input, isTyping, messages, currentEmotion, sessionId, activeMode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const startRecording = useCallback(() => {
    if (!speechSupported || isRecording) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
    interimRef.current = "";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      interimRef.current = t; setInput(t);
    };
    rec.onerror = () => { setIsRecording(false); recognitionRef.current = null; };
    rec.onend = () => { setIsRecording(false); recognitionRef.current = null; };
    recognitionRef.current = rec; setIsRecording(true); rec.start();
  }, [speechSupported, isRecording]);

  const stopRecording = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop(); recognitionRef.current = null; setIsRecording(false);
    const text = interimRef.current.trim();
    if (text) setTimeout(() => sendMessage(text), 80);
  }, [sendMessage]);

  const handleMicPointerDown = useCallback((e: React.PointerEvent) => { e.preventDefault(); startRecording(); }, [startRecording]);
  const handleMicPointerUp = useCallback((e: React.PointerEvent) => { e.preventDefault(); stopRecording(); }, [stopRecording]);

  const emotionColor = currentEmotion ? EMOTION_COLORS[currentEmotion] : null;
  const emotionLabel = currentEmotion ? EMOTION_LABELS[currentEmotion] : null;

  // Last user message coherence for persistent display
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const displayCoherence = currentCoherence ?? lastUserMsg?.coherence ?? null;

  return (
    <div className="flex flex-col h-full bg-background/60 backdrop-blur-sm">
      {/* Chat header */}
      <div className="flex-none flex items-center justify-between px-5 py-3.5 border-b border-white/8 bg-black/20">
        <div>
          <p className="text-sm font-semibold text-foreground">EmpathIQ Chat</p>
          <p className="text-xs text-muted-foreground mt-0.5">AI calibrated to your emotional state</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Coherence indicator */}
          {displayCoherence && currentEmotion && (
            <CoherenceRing
              score={displayCoherence.score}
              mismatch={displayCoherence.mismatch}
              label={displayCoherence.label}
            />
          )}
          {sessionId && (
            <span className="text-[10px] text-muted-foreground px-2 py-1 rounded-md bg-white/5 font-mono">
              #{sessionId}
            </span>
          )}
          {emotionColor && emotionLabel && (
            <div
              key={emotionFlashKey}
              className="emotion-badge-flash flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ backgroundColor: `${emotionColor}20`, color: emotionColor, boxShadow: `0 0 0 1px ${emotionColor}40` }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: emotionColor }} />
              {emotionLabel}
            </div>
          )}
        </div>
      </div>

      {/* Mode selector */}
      <div className="flex-none px-4 pt-3 pb-2 flex gap-2 overflow-x-auto scrollbar-none">
        {MODES.map((mode) => {
          const isActive = mode.id === activeMode.id;
          return (
            <button
              key={mode.id}
              onClick={() => handleModeChange(mode)}
              className="flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 whitespace-nowrap"
              style={isActive
                ? { backgroundColor: `${mode.color}18`, color: mode.color, boxShadow: `0 0 0 1.5px ${mode.color}, 0 0 12px ${mode.glow}`, animation: "modePulse 2.5s ease-in-out infinite" }
                : { backgroundColor: "transparent", color: "var(--muted-foreground)", boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }
              }
            >
              <span>{mode.emoji}</span><span>{mode.label}</span>
            </button>
          );
        })}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 pb-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{ backgroundColor: `${activeMode.color}18`, boxShadow: `0 0 0 1px ${activeMode.color}30` }}>
              {activeMode.emoji}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{activeMode.label} ready</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                EmpathIQ reads your face and words together — detecting emotional coherence in real time
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-[280px]">
              {activeMode.starters.map((s) => (
                <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-white/8 bg-white/3 hover:bg-white/6 text-muted-foreground hover:text-foreground transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
            <div className={`flex ${msg.role === "user" ? "justify-end message-enter" : "justify-start message-enter-assistant"} w-full`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5 text-sm"
                  style={{ backgroundColor: `${activeMode.color}20` }}>
                  {activeMode.emoji}
                </div>
              )}
              <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-white/5 text-foreground rounded-bl-sm border border-white/8"
              }`}>
                {msg.role === "user" && msg.emotion && (
                  <div className="flex items-center gap-1 mb-1.5 text-[10px] font-medium opacity-70">
                    <div className="w-1 h-1 rounded-full" style={{ backgroundColor: EMOTION_COLORS[msg.emotion] }} />
                    {EMOTION_LABELS[msg.emotion]}
                  </div>
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0 ml-2.5 mt-0.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-muted-foreground">
                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Coherence badge under user messages */}
            {msg.role === "user" && msg.coherence && msg.emotion && msg.emotion !== "neutral" && (
              <div className="mt-1 mr-10 flex items-center gap-1.5">
                {msg.coherence.mismatch ? (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span className="text-[9px] text-amber-400 font-medium">
                      Words say {msg.coherence.textSentiment}, face shows {EMOTION_LABELS[msg.emotion]?.toLowerCase()}
                    </span>
                  </div>
                ) : msg.coherence.score > 0.8 ? (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/15">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="text-[9px] text-green-400 font-medium">Emotionally aligned</span>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="message-enter-assistant flex justify-start">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5 text-sm"
              style={{ backgroundColor: `${activeMode.color}20` }}>
              {activeMode.emoji}
            </div>
            <div className="bg-white/5 border border-white/8 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot" />
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot" />
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex-none border-t border-white/8 bg-black/20 px-4 py-3">
        {/* Coherence live preview while typing */}
        {currentCoherence && currentEmotion && input.trim() && (
          <div className={`flex items-center gap-2 mb-2 px-2.5 py-1.5 rounded-lg w-fit transition-all ${
            currentCoherence.mismatch
              ? "bg-amber-500/10 border border-amber-500/20"
              : currentCoherence.score > 0.8
                ? "bg-green-500/10 border border-green-500/15"
                : "bg-white/5 border border-white/8"
          }`}>
            <div className="w-1.5 h-1.5 rounded-full" style={{
              backgroundColor: currentCoherence.mismatch ? "#f59e0b" : currentCoherence.score > 0.8 ? "#4ade80" : "#9ca3af"
            }} />
            <span className="text-[10px] font-medium" style={{
              color: currentCoherence.mismatch ? "#f59e0b" : currentCoherence.score > 0.8 ? "#4ade80" : "#9ca3af"
            }}>
              {currentCoherence.mismatch
                ? `⚠ Mismatch — words sound ${currentCoherence.textSentiment}, face shows ${EMOTION_LABELS[currentEmotion]?.toLowerCase()}`
                : currentCoherence.score > 0.8
                  ? "✓ Emotionally aligned"
                  : "Coherence: neutral"}
            </span>
          </div>
        )}

        {currentEmotion && emotionColor && !currentCoherence && (
          <div className="flex items-center gap-1.5 mb-2 text-[11px] px-2 py-0.5 rounded-md w-fit"
            style={{ backgroundColor: `${emotionColor}15`, color: emotionColor }}>
            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: emotionColor }} />
            Responding to your {EMOTION_LABELS[currentEmotion]?.toLowerCase()} state
          </div>
        )}

        {isRecording && (
          <div className="flex items-center gap-2 mb-2 px-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[11px] text-red-300">Recording… release to send</span>
            <SoundWave color={activeMode.color} />
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${activeMode.label}… (Enter to send)`}
            rows={1}
            className="flex-1 resize-none rounded-xl bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all min-h-[46px] max-h-[120px] scrollbar-thin"
            style={{ fieldSizing: "content" } as React.CSSProperties}
            disabled={isTyping || isRecording}
          />
          {speechSupported && (
            <button
              onPointerDown={handleMicPointerDown}
              onPointerUp={handleMicPointerUp}
              onPointerLeave={handleMicPointerUp}
              disabled={isTyping}
              title="Hold to speak"
              className={`flex-none w-11 h-11 rounded-xl flex items-center justify-center transition-all select-none touch-none ${
                isRecording
                  ? "bg-red-500 text-white scale-105"
                  : "bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/8 disabled:opacity-30"
              }`}
              style={isRecording ? { boxShadow: "0 0 16px rgba(239,68,68,0.5)" } : {}}
            >
              {isRecording ? <SoundWave color="white" /> : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
          )}
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isTyping || isRecording}
            className="flex-none w-11 h-11 rounded-xl flex items-center justify-center transition-all bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-center mt-2.5 gap-1.5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-muted-foreground/40">
            <path d="M13.5 2L3 14h9l-1.5 8 10.5-12h-9l1.5-8z" fill="currentColor" />
          </svg>
          <span className="text-[10px] text-muted-foreground/40 tracking-wide">Powered by Claude</span>
        </div>
      </div>
    </div>
  );
}
