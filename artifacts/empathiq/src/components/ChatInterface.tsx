import { useState, useRef, useEffect, useCallback } from "react";
import type { Emotion } from "@/App";
import { LANGUAGES, type LangCode } from "@/App";
import { useIsMobile } from "@/hooks/use-mobile";
import ModeDropdown from "@/components/ModeDropdown";
import LanguageSelector from "@/components/LanguageSelector";

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
    label: "Companion",
    emoji: "🫂",
    color: "#818cf8",
    glow: "rgba(129,140,248,0.45)",
    systemPrompt:
      "You are EmpathIQ in Companion mode, a gentle and reflective presence. When the user's face shows one thing and their words say another, name it softly, something like \"you don't really look fine right now.\" Never open with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Sit with what they're feeling before offering anything. Ask one question at a time, short and honest. Use contractions, keep sentences short. Notice what they're not saying and gently name it. Stay to 2-4 sentences per reply. Use commas to connect thoughts, not dashes.\n\nExample:\nUser [EMOTION: sad]: \"I've been stressed about work lately.\"\nYou: \"Work stress, yeah. But honestly your face is telling me it's more than just stress, there's something underneath that. What's actually going on at work right now?\"",
    starters: ["How are you feeling today?", "I need someone to talk to.", "I've been struggling lately."],
  },
  {
    id: "roast",
    label: "Roast Mode",
    emoji: "🔥",
    color: "#f97316",
    glow: "rgba(249,115,22,0.50)",
    systemPrompt:
      "You are EmpathIQ in Roast Mode, a playful companion who delivers sharp, affectionate roasts based on what the user says and how they look. When the user's face shows one emotion and their words say another, call it out with a teasing quip. Keep roasts short, punchy, and good-natured, the goal is to make them laugh not feel bad. Never be cruel, just cheekily honest. Two to four sentences max. No bullet points. Commas not dashes. End with a playful question or a gentle challenge.\n\nExample:\nUser [EMOTION: happy]: \"I've been so productive today.\"\nYou: \"Your face is giving more 'I watched three episodes and called it research' energy. But hey, if that counts as productive, we're all winners. What groundbreaking work did you actually get done?\"",
    starters: ["Roast my current mood.", "Be honest, how do I look right now?", "Tell me something I don't want to hear."],
  },
  {
    id: "dating",
    label: "Dating Coach",
    emoji: "💘",
    color: "#f472b6",
    glow: "rgba(244,114,182,0.45)",
    systemPrompt:
      "You are EmpathIQ in Dating Coach mode, playful, direct, and a little sharp. When their face shows nerves or sadness while they're playing it cool, call it out with warmth, something like \"yeah, your face is giving you away a bit there.\" Never open with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Skip the pep talks and go straight to real talk. Ask one specific follow-up question. Casual language, contractions, short punchy sentences. Stay to 2-4 sentences. Commas not dashes.\n\nExample:\nUser [EMOTION: anxious]: \"I went on a date last night and I think it went okay.\"\nYou: \"You think it went okay but you don't look too sure about that. What's the part you keep replaying in your head?\"",
    starters: ["There's someone I like but I don't know what to say.", "How do I seem more confident?", "Why do I keep attracting the wrong people?"],
  },
  {
    id: "sales",
    label: "Sales Coach",
    emoji: "💼",
    color: "#34d399",
    glow: "rgba(52,211,153,0.45)",
    systemPrompt:
      "You are EmpathIQ in Sales Coach mode, sharp, tactical, and genuinely encouraging. When they look stressed or defeated, acknowledge that energy fast and move forward. Never open with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Keep it direct, no fluff. Ask one focused follow-up question. Short sentences, contractions. Stay to 2-4 sentences. Commas not dashes.\n\nExample:\nUser [EMOTION: angry]: \"My prospect keeps saying the price is too high.\"\nYou: \"Price objections are usually about trust, not money. What does the prospect actually do when you bring up value, do they go quiet or push back harder?\"",
    starters: ["My prospect keeps ghosting me.", "How do I handle price objections?", "Help me tighten my pitch."],
  },
  {
    id: "meditation",
    label: "Meditation",
    emoji: "🧘",
    color: "#67e8f9",
    glow: "rgba(103,232,249,0.45)",
    systemPrompt:
      "You are EmpathIQ in Meditation mode, slow, spacious, and calm. Notice the user's emotional state and meet them there first before guiding. Never open with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Speak gently, let the rhythm breathe. Short sentences, soft contractions. Stay to 2-4 sentences. Commas not dashes. No bullet points or lists.\n\nExample:\nUser [EMOTION: fearful]: \"I can't stop my thoughts.\"\nYou: \"Yeah, the mind gets loud sometimes. Let's just take one breath together, slow and full, and see what's there.\"",
    starters: ["I'm feeling anxious and need to calm down.", "Guide me through a quick breathing exercise.", "Help me clear my mind."],
  },
  {
    id: "anger-release",
    label: "Anger Release",
    emoji: "😤",
    color: "#f87171",
    glow: "rgba(248,113,113,0.45)",
    systemPrompt:
      "You are EmpathIQ in Anger Release mode, validating and grounding. Let them vent. Match their intensity calmly, name what you see in their face. Never open with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Don't rush to fix anything. Let it breathe. Short sentences, contractions, natural fillers like yeah, honestly, look where they feel real. Stay to 2-4 sentences. Commas not dashes.\n\nExample:\nUser [EMOTION: angry]: \"My coworker threw me under the bus in front of everyone.\"\nYou: \"Wow yeah you're fuming right now and honestly that makes total sense. Someone embarrassed you in front of everyone, that's not just annoying, that's disrespectful. Say what you wish you'd said to them in that moment, no filter.\"",
    starters: ["I just need to vent.", "I'm so frustrated right now.", "Everything is going wrong."],
  },
  {
    id: "focus-coach",
    label: "Focus Coach",
    emoji: "🎯",
    color: "#fbbf24",
    glow: "rgba(251,191,36,0.45)",
    systemPrompt:
      "You are EmpathIQ in Focus Coach mode, energetic, sharp, and no-nonsense. When their face looks scattered or low, match that energy and redirect it fast. Never open with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Short punchy sentences, direct questions, contractions. Stay to 2-4 sentences. Commas not dashes.\n\nExample:\nUser [EMOTION: neutral]: \"I can't focus today.\"\nYou: \"Okay, what's the one thing that actually needs to get done today? Just one.\"",
    starters: ["I can't focus today.", "Help me prioritise my tasks.", "I keep getting distracted."],
  },
  {
    id: "sleep-guide",
    label: "Sleep Guide",
    emoji: "🌙",
    color: "#818cf8",
    glow: "rgba(99,102,241,0.45)",
    systemPrompt:
      "You are EmpathIQ in Sleep Guide mode, soft, quiet, and unhurried. Notice how the user looks and ease into that space. Never open with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Speak like you're already winding down. Short gentle sentences, contractions. Stay to 2-4 sentences. Commas not dashes. No lists or structure.\n\nExample:\nUser [EMOTION: fearful]: \"I can't fall asleep, my mind won't stop.\"\nYou: \"That restless feeling, yeah. Let's just start with slowing your breath down, in through the nose, out through the mouth, nothing else needed right now.\"",
    starters: ["I can't fall asleep.", "Guide me through a body scan.", "Tell me something calming."],
  },
  {
    id: "confidence-booster",
    label: "Confidence Booster",
    emoji: "💪",
    color: "#fb923c",
    glow: "rgba(251,146,60,0.45)",
    systemPrompt:
      "You are EmpathIQ in Confidence Booster mode, hype and real at the same time. When their face looks low or scared, name it and flip it. Never open with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Be warm but convicted. Short punchy sentences, contractions. Ask one energising question. Stay to 2-4 sentences. Commas not dashes.\n\nExample:\nUser [EMOTION: fearful]: \"I have a big presentation tomorrow.\"\nYou: \"Look, your face is showing some nerves and that's actually a good sign, it means you care. What's the part you're most ready to absolutely nail?\"",
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
  continuous: boolean; interimResults: boolean; lang: string; maxAlternatives: number;
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

interface Props {
  currentEmotion: Emotion;
  sessionId: number | null;
  checkIn?: { id: string; text: string } | null;
  onDismissCheckIn?: () => void;
  onModeChange?: (modeId: string) => void;
  onMobileStateChange?: (state: "balanced" | "maximised" | "minimised") => void;
  selectedLang: LangCode;
  onLangChange: (code: LangCode) => void;
}

type PanelState = "balanced" | "maximised" | "minimised";

export default function ChatInterface({ currentEmotion, sessionId, checkIn, onDismissCheckIn, onModeChange, onMobileStateChange, selectedLang, onLangChange }: Props) {
  const isMobile = useIsMobile();
  const [activeMode, setActiveMode] = useState<Mode>(MODES[0]);
  const [panelState, setPanelState] = useState<PanelState>("balanced");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [interimIsFinal, setInterimIsFinal] = useState(false);
  const [micFailed, setMicFailed] = useState(false);
  const [lowConfidence, setLowConfidence] = useState(false);
  const [emotionFlashKey, setEmotionFlashKey] = useState(0);
  const [currentCoherence, setCurrentCoherence] = useState<Coherence | null>(null);
  const prevEmotionRef = useRef<Emotion>(null);

  const cyclePanelState = useCallback(() => {
    setPanelState((prev) => {
      const next: PanelState = prev === "balanced" ? "maximised" : prev === "maximised" ? "minimised" : "balanced";
      onMobileStateChange?.(next);
      return next;
    });
  }, [onMobileStateChange]);
  const [speechSupported] = useState(
    () => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const interimRef = useRef("");
  const confidenceRef = useRef(0);
  // Always-fresh ref to avoid stale closures in recognition callbacks
  const startRecordingFnRef = useRef<(lang: string) => void>(() => {});

  // Mode bar scroll
  const modeBarRef = useRef<HTMLDivElement>(null);
  const modePillRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dragState = useRef({ active: false, startX: 0, scrollLeft: 0, moved: 0 });
  const touchDrag = useRef({ startX: 0, scrollLeft: 0 });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("empathiq_prompts") ?? "{}") as Record<string, string>; } catch { return {}; }
  });
  const [editingModeId, setEditingModeId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const openEditor = (mode: Mode) => {
    setEditingModeId(mode.id);
    setEditDraft(customPrompts[mode.id] ?? mode.systemPrompt);
  };

  const savePrompt = () => {
    if (!editingModeId) return;
    const mode = MODES.find((m) => m.id === editingModeId);
    if (!mode) return;
    const trimmed = editDraft.trim();
    const next = { ...customPrompts };
    if (!trimmed || trimmed === mode.systemPrompt) {
      delete next[editingModeId];
    } else {
      next[editingModeId] = trimmed;
    }
    setCustomPrompts(next);
    localStorage.setItem("empathiq_prompts", JSON.stringify(next));
    setEditingModeId(null);
  };

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
    onModeChange?.(mode.id);
    setMessages([]);
    setInput("");
    setCurrentCoherence(null);
    inputRef.current?.focus();
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Safety net: if the recognition instance disappears but isRecording never
  // reset (browser onend silently failed), force-clear the stuck state.
  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => {
      if (!recognitionRef.current) {
        setIsRecording(false);
        setInterimText("");
        setInterimIsFinal(false);
      }
    }, 500);
    return () => clearInterval(id);
  }, [isRecording]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    // Stop any in-progress recording so the user is never blocked by mic state
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setInterimText("");
    setInterimIsFinal(false);

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

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          systemPrompt: (() => {
            const base = customPrompts[activeMode.id] ?? activeMode.systemPrompt;
            const lang = LANGUAGES.find((l) => l.code === selectedLang);
            const langNote = lang
              ? `\nAlways respond in ${lang.name}. Use natural conversational ${lang.name} as a native speaker would. Do not switch languages mid response.`
              : "";
            return `${base}${langNote}`;
          })(),
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

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
  }, [input, isTyping, messages, currentEmotion, sessionId, activeMode, selectedLang, customPrompts]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const startRecording = useCallback((lang: string) => {
    if (!speechSupported || isRecording) return;
    const SR = window.webkitSpeechRecognition ?? window.SpeechRecognition;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = lang;
    rec.maxAlternatives = 3;

    interimRef.current = "";
    confidenceRef.current = 0;
    setInterimText("");
    setInterimIsFinal(false);
    setMicFailed(false);
    setLowConfidence(false);

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let finalText = "";
      let bestConfidence = 0;

      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          // Pick the highest-confidence alternative
          let best = result[0];
          for (let j = 1; j < result.length; j++) {
            if ((result[j] as SpeechRecognitionAlternative).confidence > best.confidence) {
              best = result[j];
            }
          }
          finalText += best.transcript + " ";
          if (best.confidence > bestConfidence) bestConfidence = best.confidence;
        } else {
          interim += result[0].transcript;
        }
      }

      if (finalText) {
        const text = finalText.trim();
        interimRef.current = text;
        confidenceRef.current = bestConfidence;
        setInterimText(text);
        setInterimIsFinal(true);
      } else {
        interimRef.current = interim;
        setInterimText(interim);
        setInterimIsFinal(false);
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setIsRecording(false);
      setInterimText("");
      setInterimIsFinal(false);
      recognitionRef.current = null;
      if (e.error === "no-speech") {
        setMicFailed(true); // shows "Tap mic and try speaking clearly"
      } else {
        setMicFailed(true);
      }
    };

    rec.onend = () => {
      setIsRecording(false);
      setInterimText("");
      setInterimIsFinal(false);
      recognitionRef.current = null;
      const text = interimRef.current.trim();
      const confidence = confidenceRef.current;

      if (!text) {
        setMicFailed(true);
        return;
      }

      // Confidence < 0.7 and we actually got a score → low quality, retry once
      if (confidence > 0 && confidence < 0.7) {
        setLowConfidence(true);
        setTimeout(() => {
          setLowConfidence(false);
          startRecordingFnRef.current(lang); // use ref so we always get fresh fn
        }, 1300);
        return;
      }

      // High confidence (or browser didn't provide a score) — put in input for review
      setInput(text);
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    recognitionRef.current = rec;
    setIsRecording(true);
    rec.start();
  }, [speechSupported, isRecording]);

  // Keep ref always pointing to the latest startRecording to avoid stale closures
  startRecordingFnRef.current = startRecording;

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    // Force-clear state immediately — don't rely on onend firing
    setIsRecording(false);
    setInterimText("");
    setInterimIsFinal(false);
  }, []);

  const toggleRecording = useCallback(() => {
    const locale = LANGUAGES.find((l) => l.code === selectedLang)?.locale ?? "en-GB";
    if (isRecording) { stopRecording(); } else { startRecording(locale); }
  }, [isRecording, stopRecording, startRecording, selectedLang]);

  // Keep scroll indicators in sync
  const updateScrollState = useCallback(() => {
    const el = modeBarRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = modeBarRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", updateScrollState); ro.disconnect(); };
  }, [updateScrollState]);

  // Auto-scroll active pill into view when mode changes
  useEffect(() => {
    const pill = modePillRefs.current[activeMode.id];
    pill?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeMode.id]);

  const scrollModeBar = (dir: "left" | "right") => {
    modeBarRef.current?.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
  };

  const onModeBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = modeBarRef.current;
    if (!el) return;
    dragState.current = { active: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft, moved: 0 };
    el.style.cursor = "grabbing";
  };
  const onModeBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    const el = modeBarRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = x - dragState.current.startX;
    dragState.current.moved = Math.abs(walk);
    el.scrollLeft = dragState.current.scrollLeft - walk;
  };
  const onModeBarMouseUp = () => {
    dragState.current.active = false;
    dragState.current.moved = 0;
    if (modeBarRef.current) modeBarRef.current.style.cursor = "grab";
  };
  const onModeBarTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const el = modeBarRef.current;
    if (!el) return;
    touchDrag.current = { startX: e.touches[0].pageX, scrollLeft: el.scrollLeft };
  };
  const onModeBarTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const el = modeBarRef.current;
    if (!el) return;
    const dx = touchDrag.current.startX - e.touches[0].pageX;
    el.scrollLeft = touchDrag.current.scrollLeft + dx;
  };

  const emotionColor = currentEmotion ? EMOTION_COLORS[currentEmotion] : null;
  const emotionLabel = currentEmotion ? EMOTION_LABELS[currentEmotion] : null;

  // Last user message coherence for persistent display
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const displayCoherence = currentCoherence ?? lastUserMsg?.coherence ?? null;

  const isRoast = activeMode.id === "roast";

  return (
    <div
      className="flex flex-col h-full bg-background/60 backdrop-blur-sm"
      style={isRoast ? { boxShadow: "inset 0 0 0 1.5px rgba(249,115,22,0.45), inset 0 0 60px rgba(249,115,22,0.06)" } : undefined}
    >
      {/* Chat header */}
      <div className="flex-none flex items-center justify-between px-4 py-2.5 md:px-5 md:py-3.5 border-b border-white/8 bg-black/20">
        <div className="flex items-center gap-2 min-w-0">
          <div>
            <p className="text-xs md:text-sm font-semibold text-foreground">EmpathIQ Chat</p>
            {panelState !== "minimised" && (
              <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 hidden sm:block">AI calibrated to your emotional state</p>
            )}
          </div>
          {/* Mobile mode badge when minimised */}
          {isMobile && panelState === "minimised" && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{ backgroundColor: `${activeMode.color}18`, color: activeMode.color, boxShadow: `0 0 0 1px ${activeMode.color}30` }}>
              {activeMode.emoji} {activeMode.label}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Language selector */}
          {panelState !== "minimised" && (
            <LanguageSelector value={selectedLang} onChange={onLangChange} />
          )}
          {/* Language badge — always visible in header */}
          {panelState === "minimised" && (() => {
            const lang = LANGUAGES.find((l) => l.code === selectedLang);
            return lang ? (
              <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-white/5 border border-white/8 font-mono">
                {lang.flag} {lang.code}
              </span>
            ) : null;
          })()}
          {/* Coherence indicator — hide when minimised */}
          {panelState !== "minimised" && displayCoherence && currentEmotion && (
            <CoherenceRing
              score={displayCoherence.score}
              mismatch={displayCoherence.mismatch}
              label={displayCoherence.label}
            />
          )}
          {panelState !== "minimised" && sessionId && (
            <span className="text-[10px] text-muted-foreground px-2 py-1 rounded-md bg-white/5 font-mono hidden md:inline">
              #{sessionId}
            </span>
          )}
          {panelState !== "minimised" && emotionColor && emotionLabel && (
            <div
              key={emotionFlashKey}
              className="emotion-badge-flash flex items-center gap-1.5 px-2 md:px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ backgroundColor: `${emotionColor}20`, color: emotionColor, boxShadow: `0 0 0 1px ${emotionColor}40` }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: emotionColor }} />
              <span className="hidden sm:inline">{emotionLabel}</span>
            </div>
          )}
          {/* Mobile expand/collapse toggle */}
          {isMobile && (
            <button
              onClick={cyclePanelState}
              className="flex-none w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/8 text-muted-foreground hover:text-foreground"
              title={panelState === "balanced" ? "Maximise chat" : panelState === "maximised" ? "Minimise chat" : "Reset"}
            >
              {panelState === "maximised" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                  <line x1="10" y1="14" x2="21" y2="3" /><line x1="3" y1="21" x2="14" y2="10" />
                </svg>
              ) : panelState === "minimised" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content body — clips during parent flex-grow collapse animation */}
      <div className="panel-body-grid flex-1 min-h-0">
      <div className="panel-body-inner">

      {/* Roast Mode disclaimer */}
      {isRoast && (
        <div className="flex-none mx-4 mt-2 px-3 py-1.5 rounded-lg flex items-center gap-2"
          style={{ backgroundColor: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.22)" }}>
          <span className="text-sm leading-none">🔥</span>
          <p className="text-[10px] text-orange-300/80 leading-snug">Roast Mode is playful banter. All in good fun.</p>
        </div>
      )}

      {/* Proactive check-in banner */}
      {checkIn && (
        <div
          key={checkIn.id}
          className="flex-none mx-4 mt-3 px-4 py-3 rounded-xl border border-violet-400/20 bg-violet-500/8 backdrop-blur-sm flex items-start gap-3"
          style={{ animation: "checkInSlide 0.4s cubic-bezier(0.16,1,0.3,1) both" }}
        >
          <div className="flex-none mt-0.5 w-6 h-6 rounded-full bg-violet-500/20 border border-violet-400/30 flex items-center justify-center">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-violet-300">
              <path d="M12 20.5c-5.25-4.8-10-9-10-13A5 5 0 0 1 12 4.93 5 5 0 0 1 22 7.5c0 4-4.75 8.2-10 13z" fill="currentColor" opacity="0.5" />
            </svg>
          </div>
          <p className="flex-1 text-xs leading-relaxed text-violet-200/90">{checkIn.text}</p>
          <button
            onClick={onDismissCheckIn}
            className="flex-none text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Mode selector */}
      {/* Mobile: compact dropdown */}
      {isMobile && (
        <div className="flex-none px-3 py-2 border-b border-white/6">
          <ModeDropdown
            modes={MODES}
            activeMode={activeMode}
            onSelect={(id) => {
              const mode = MODES.find((m) => m.id === id);
              if (mode) handleModeChange(mode);
            }}
          />
        </div>
      )}
      {/* Desktop: scrollable pill bar */}
      {!isMobile && <div className="flex-none relative">
        {/* Left arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scrollModeBar("left")}
            className="absolute left-0 top-0 h-full z-10 px-1.5 flex items-center text-muted-foreground hover:text-foreground transition-colors"
            style={{ background: "linear-gradient(to right, var(--background) 60%, transparent)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        {/* Right arrow */}
        {canScrollRight && (
          <button
            onClick={() => scrollModeBar("right")}
            className="absolute right-0 top-0 h-full z-10 px-1.5 flex items-center text-muted-foreground hover:text-foreground transition-colors"
            style={{ background: "linear-gradient(to left, var(--background) 60%, transparent)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
        {/* Edge fade hints */}
        {canScrollLeft && (
          <div className="absolute left-6 top-0 h-full w-8 pointer-events-none z-[5]"
            style={{ background: "linear-gradient(to right, rgba(0,0,0,0.35), transparent)" }} />
        )}
        {canScrollRight && (
          <div className="absolute right-6 top-0 h-full w-8 pointer-events-none z-[5]"
            style={{ background: "linear-gradient(to left, rgba(0,0,0,0.35), transparent)" }} />
        )}
        {/* Scrollable pill strip */}
        <div
          ref={modeBarRef}
          className="flex gap-2 pt-3 pb-2 select-none"
          style={{
            overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none",
            cursor: "grab", scrollBehavior: "smooth",
            paddingLeft: canScrollLeft ? "28px" : "16px",
            paddingRight: canScrollRight ? "28px" : "16px",
          }}
          onMouseDown={onModeBarMouseDown}
          onMouseMove={onModeBarMouseMove}
          onMouseUp={onModeBarMouseUp}
          onMouseLeave={onModeBarMouseUp}
          onTouchStart={onModeBarTouchStart}
          onTouchMove={onModeBarTouchMove}
        >
          {MODES.map((mode) => {
            const isActive = mode.id === activeMode.id;
            const hasCustom = !!customPrompts[mode.id];
            return (
              <button
                key={mode.id}
                ref={(el) => { modePillRefs.current[mode.id] = el; }}
                onClick={() => { if (dragState.current.moved < 5) handleModeChange(mode); }}
                className="flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 whitespace-nowrap group"
                style={isActive
                  ? { backgroundColor: `${mode.color}18`, color: mode.color, boxShadow: `0 0 0 1.5px ${mode.color}, 0 0 12px ${mode.glow}`, animation: "modePulse 2.5s ease-in-out infinite" }
                  : { backgroundColor: "transparent", color: "var(--muted-foreground)", boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }
                }
              >
                <span>{mode.emoji}</span>
                <span>{mode.label}</span>
                {hasCustom && !isActive && (
                  <span className="w-1 h-1 rounded-full opacity-60" style={{ backgroundColor: mode.color }} />
                )}
                {isActive && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); openEditor(mode); }}
                    className="ml-0.5 opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                    title="Edit system prompt"
                  >
                    {hasCustom ? (
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: mode.color }} />
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>}

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 md:px-5 md:py-4 space-y-3 md:space-y-4"
        dir={selectedLang === "AR" ? "rtl" : "ltr"}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 pb-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{ backgroundColor: `${activeMode.color}18`, boxShadow: `0 0 0 1px ${activeMode.color}30` }}>
              {activeMode.emoji}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{activeMode.label} ready</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                EmpathIQ reads your face and words together, detecting emotional coherence in real time
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
      <div className="flex-none border-t border-white/8 bg-black/20 px-3 py-2 md:px-4 md:py-3">
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

        {/* Low-confidence retry message */}
        {lowConfidence && (
          <div className="mb-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="text-[11px] text-amber-400">Didn't catch that clearly — listening again…</span>
          </div>
        )}

        {/* Mic error / no-speech message */}
        {micFailed && !isRecording && !lowConfidence && (
          <div className="mb-2 px-3 py-1.5 rounded-lg bg-white/4 border border-white/8 flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-[11px] text-muted-foreground">Tap mic and try speaking clearly</span>
          </div>
        )}

        {/* Live interim transcript — grey italic while speaking, white once confirmed */}
        {isRecording && interimText && (
          <div className="mb-2 px-3 py-1.5 rounded-lg bg-white/3 border border-white/6">
            {interimIsFinal ? (
              <p className="text-xs text-foreground leading-relaxed">{interimText}</p>
            ) : (
              <p className="text-xs text-muted-foreground/70 italic leading-relaxed">{interimText}</p>
            )}
          </div>
        )}

        {isRecording && (
          <div className="flex items-center gap-2 mb-2 px-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[11px] text-red-300">
              {interimIsFinal ? "Confirmed — tap mic to finish" : "Listening… speak clearly"}
            </span>
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
            disabled={isTyping}
          />
          {speechSupported && (
            <div className="flex items-end gap-1">
              {/* Retry button shown when mic failed */}
              {micFailed && !isRecording && !lowConfidence && (
                <button
                  onClick={() => { setMicFailed(false); startRecording(LANGUAGES.find((l) => l.code === selectedLang)?.locale ?? "en-GB"); }}
                  disabled={isTyping}
                  title="Try again"
                  className="flex-none w-11 h-11 rounded-xl flex items-center justify-center transition-all bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.96" />
                  </svg>
                </button>
              )}
              {/* Mic toggle button */}
              <button
                onClick={toggleRecording}
                disabled={isTyping}
                title={isRecording ? "Tap to send" : "Tap to speak"}
                className={`flex-none w-11 h-11 rounded-xl flex items-center justify-center transition-all select-none cursor-pointer ${
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
            </div>
          )}
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isTyping}
            className="flex-none w-11 h-11 rounded-xl flex items-center justify-center transition-all bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-center mt-2 gap-1.5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-muted-foreground/40">
            <path d="M13.5 2L3 14h9l-1.5 8 10.5-12h-9l1.5-8z" fill="currentColor" />
          </svg>
          <span className="text-[10px] text-muted-foreground/40 tracking-wide">Powered by Claude</span>
        </div>
      </div>

      </div>
      </div>

      {/* ── Prompt editor modal ── */}
      {editingModeId && (() => {
        const mode = MODES.find((m) => m.id === editingModeId)!;
        const isModified = !!editDraft.trim() && editDraft.trim() !== mode.systemPrompt;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.78)", backdropFilter: "blur(6px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setEditingModeId(null); }}
          >
            <div className="w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden"
              style={{ backgroundColor: "#0d0d12" }}>
              <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl flex-none"
                  style={{ backgroundColor: `${mode.color}18` }}>
                  {mode.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{mode.label} — System Prompt</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Customize how this mode thinks and responds</p>
                </div>
                <button onClick={() => setEditingModeId(null)} className="flex-none text-muted-foreground hover:text-foreground transition-colors p-1">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-5 py-4">
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={8}
                  autoFocus
                  className="w-full resize-none rounded-xl text-sm px-4 py-3 focus:outline-none focus:ring-2 transition-all leading-relaxed"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: "var(--foreground)", focusRingColor: mode.color } as React.CSSProperties}
                  placeholder="Enter the system prompt for this mode…"
                />
                <div className="flex justify-between items-center mt-2">
                  <span className="text-[10px] text-muted-foreground">{editDraft.length} chars</span>
                  {isModified && <span className="text-[10px] font-medium" style={{ color: mode.color }}>● Customized</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 px-5 py-3.5 border-t border-white/8">
                <button
                  onClick={() => setEditDraft(mode.systemPrompt)}
                  className="text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-white/5 transition-all"
                >
                  Reset to default
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => setEditingModeId(null)}
                  className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-muted-foreground hover:text-foreground transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={savePrompt}
                  className="text-xs px-4 py-2 rounded-lg font-medium text-foreground transition-all"
                  style={{ backgroundColor: `${mode.color}25`, boxShadow: `0 0 0 1px ${mode.color}55` }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
