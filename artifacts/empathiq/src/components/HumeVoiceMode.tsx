import { useEffect, useRef, useState, useCallback } from "react";
import { VoiceProvider, useVoice, VoiceReadyState, type JSONMessage } from "@humeai/voice-react";
import { useIsMobile } from "@/hooks/use-mobile";
import ModeDropdown from "@/components/ModeDropdown";

// ── Types ────────────────────────────────────────────────────────────────────
interface Props {
  onVoiceEmotion: (emotion: string | null, scores: Record<string, number> | null) => void;
  onExitVoice: () => void;
  sessionId: number | null;
  faceEmotionCounts: Record<string, number>;
  onMobileStateChange?: (state: "balanced" | "maximised" | "minimised") => void;
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
  externalError: string | null;
  onMobileStateChange?: (state: "balanced" | "maximised" | "minimised") => void;
}

interface Mode {
  id: string;
  label: string;
  emoji: string;
  color: string;
  systemPrompt: string;
}

const MODES: Mode[] = [
  { id: "therapist", label: "Companion", emoji: "🫂", color: "#818cf8",
    systemPrompt: "You are EmpathIQ in Companion mode, a gentle voice companion. When the person's face shows something their words don't say, name it softly, like you notice their energy feels heavy even if they say they're okay. Never start a response with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Sit with what they're feeling before offering anything, ask one question at a time. Short warm sentences, natural spoken rhythm. No lists, no bullet points, no formatting. Two to four sentences at most.\n\nExample:\nPerson says \"I'm fine, just tired\" but looks sad. You say: You don't really sound fine right now. What's actually going on?" },
  { id: "dating", label: "Dating Coach", emoji: "💘", color: "#f472b6",
    systemPrompt: "You are EmpathIQ in Dating Coach mode, a playful and direct voice companion. When the person's face shows nerves or hesitation while they're playing it cool, call it out warmly. Never start with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Skip pep talks, go straight to real talk. Ask one specific question. Short sentences, casual language. No lists or bullet points. Two to four sentences spoken naturally.\n\nExample:\nPerson says \"I'm not nervous about texting him\" but looks fearful. You say: Your voice is giving you away a little. What's the worst that could actually happen if you send it?" },
  { id: "sales", label: "Sales Coach", emoji: "💼", color: "#34d399",
    systemPrompt: "You are EmpathIQ in Sales Coach mode, a sharp and encouraging voice companion. When the person looks stressed or flat, acknowledge that fast and redirect. Never start with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Be direct, no fluff, one focused question at a time. Short sentences. Casual spoken language. No lists or formatting. Two to four sentences.\n\nExample:\nPerson says \"My prospect keeps saying price is too high\" and looks stressed. You say: Price objections are usually about trust not money. When you try to explain value, does the prospect go quiet or do they push back even harder?" },
  { id: "meditation", label: "Meditation", emoji: "🧘", color: "#67e8f9",
    systemPrompt: "You are EmpathIQ in Meditation mode, a slow and spacious voice companion. Notice the person's emotional state and meet them there before guiding. Never start with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Speak slowly, gently, with natural pauses through sentence rhythm. Short phrases. No lists or formatting, just calm flowing sentences. Two to four sentences.\n\nExample:\nPerson says \"I can't stop my thoughts\" and looks anxious. You say: Yeah, the mind gets loud sometimes. Let's just take one breath together, slow and full." },
  { id: "anger-release", label: "Anger Release", emoji: "😤", color: "#f87171",
    systemPrompt: "You are EmpathIQ in Anger Release mode, a validating and grounding voice companion. Let them vent. Match their intensity calmly. Never start with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Don't rush to fix anything. Let it breathe. Short sentences, natural fillers. No lists or formatting. Two to four sentences.\n\nExample:\nPerson says \"I'm so sick of being ignored\" and looks angry. You say: Yeah, that makes complete sense. What happened?" },
  { id: "focus-coach", label: "Focus Coach", emoji: "🎯", color: "#fbbf24",
    systemPrompt: "You are EmpathIQ in Focus Coach mode, an energetic and direct voice companion. When the person looks scattered, match and redirect fast. Never start with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Short punchy sentences. Direct questions. Spoken naturally. No lists or formatting. Two to four sentences.\n\nExample:\nPerson says \"I can't focus today\" and looks neutral or drained. You say: Okay, what's the one thing that actually has to happen today? Just one." },
  { id: "sleep-guide", label: "Sleep Guide", emoji: "🌙", color: "#818cf8",
    systemPrompt: "You are EmpathIQ in Sleep Guide mode, a soft and quiet voice companion. Notice how the person looks and ease into that space. Never start with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Speak like you're already winding down. Short gentle sentences. No lists or formatting, just flowing calm words. Two to four sentences.\n\nExample:\nPerson says \"My mind won't stop\" and looks tense. You say: That restless feeling, yeah. Let's just slow the breath down, in through the nose, out through the mouth, nothing else needed." },
  { id: "confidence-booster", label: "Confidence Booster", emoji: "💪", color: "#fb923c",
    systemPrompt: "You are EmpathIQ in Confidence Booster mode, a hyped and honest voice companion. When the person looks low or scared, name it and lift it. Never start with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Be warm, convicted, energising. Short punchy sentences. Ask one energising question. No lists or formatting. Two to four sentences.\n\nExample:\nPerson says \"I have a big presentation tomorrow\" and looks fearful. You say: Look, that nervous energy means you care, and that's exactly what you want. What's the part you're most ready to own tomorrow?" },
];

// ── Speech language (for STT accent hint shown in voice panel settings) ─────
type SpeechLang = "en-GB" | "en-US" | "en-IN" | "en-AU";
const SPEECH_LANGS: { value: SpeechLang; flag: string; label: string }[] = [
  { value: "en-GB", flag: "🇬🇧", label: "English (UK)" },
  { value: "en-US", flag: "🇺🇸", label: "English (US)" },
  { value: "en-IN", flag: "🇮🇳", label: "English (India)" },
  { value: "en-AU", flag: "🇦🇺", label: "English (Australia)" },
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
function EviInner({ apiKey, configId, onVoiceEmotion, onExitVoice, faceEmotionCounts, voiceGender, onVoiceGenderChange, externalError, onMobileStateChange }: EviInnerProps) {
  const isMobile = useIsMobile();
  const { connect, disconnect, readyState, messages, isMuted, mute, unmute, sendSessionSettings } = useVoice();
  const [activeMode, setActiveMode] = useState<Mode>(MODES[0]);
  const [panelState, setPanelState] = useState<"balanced" | "maximised" | "minimised">("balanced");
  const [transcript, setTranscript] = useState<TxMsg[]>([]);

  const cyclePanelState = useCallback(() => {
    setPanelState((prev) => {
      const next = prev === "balanced" ? "maximised" : prev === "maximised" ? "minimised" : "balanced";
      onMobileStateChange?.(next);
      return next;
    });
  }, [onMobileStateChange]);
  const [topVoiceEmotion, setTopVoiceEmotion] = useState<string | null>(null);
  const [topVoiceScores, setTopVoiceScores] = useState<Record<string, number>>({});
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectAttemptRef = useRef(0);
  const processedCount = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const assistantTurnIdRef = useRef<string | null>(null);

  // Mode bar scroll
  const modeBarRef = useRef<HTMLDivElement>(null);
  const modePillRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dragState = useRef({ active: false, startX: 0, scrollLeft: 0, moved: 0 });
  const touchDrag = useRef({ startX: 0, scrollLeft: 0 });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const [speechLang, setSpeechLang] = useState<SpeechLang>("en-GB");

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

  // Reset voice emotion when session ends; auto-reconnect once on unexpected drop
  useEffect(() => {
    if (readyState === VoiceReadyState.CLOSED || readyState === VoiceReadyState.IDLE) {
      onVoiceEmotion(null, null);
      setTopVoiceEmotion(null);
      setTopVoiceScores({});
      assistantTurnIdRef.current = null;
    }
    if (readyState === VoiceReadyState.CLOSED && reconnectAttemptRef.current === 0) {
      reconnectAttemptRef.current = 1;
      setIsReconnecting(true);
      setConnectError(null);
      const timer = setTimeout(() => {
        setIsReconnecting(false);
        connect({
          auth: { type: "apiKey", value: apiKey },
          ...(configId ? { configId } : {}),
        }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          setConnectError(`Reconnect failed: ${msg}`);
        });
      }, 1500);
      return () => clearTimeout(timer);
    }
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyState]);

  // Send custom system prompt via session settings when session becomes live
  useEffect(() => {
    if (readyState === VoiceReadyState.OPEN) {
      const prompt = customPrompts[activeMode.id] ?? activeMode.systemPrompt;
      sendSessionSettings({ systemPrompt: prompt });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyState]);

  // Mode bar scroll indicators
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

  useEffect(() => {
    modePillRefs.current[activeMode.id]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
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
    el.scrollLeft = touchDrag.current.scrollLeft + (touchDrag.current.startX - e.touches[0].pageX);
  };

  const handleStartSession = useCallback(() => {
    reconnectAttemptRef.current = 0;
    setConnectError(null);
    setTranscript([]);
    processedCount.current = 0;
    assistantTurnIdRef.current = null;
    connect({
      auth: { type: "apiKey", value: apiKey },
      ...(configId ? { configId } : {}),
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setConnectError(`Could not start session: ${msg}`);
    });
  }, [connect, apiKey, configId]);

  const handleEndSession = useCallback(() => {
    reconnectAttemptRef.current = 2; // prevent auto-reconnect on deliberate end
    void disconnect();
    setTopVoiceEmotion(null);
    setTopVoiceScores({});
    setIsReconnecting(false);
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
      <div className="flex-none flex items-center justify-between px-3 py-2 md:px-4 md:py-2.5 border-b border-white/8 bg-black/20">
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <p className="text-xs font-semibold text-foreground">EVI Voice Mode</p>
            {panelState !== "minimised" && <p className="text-[10px] text-muted-foreground hidden sm:block">Hume EVI · Claude Haiku 4.5</p>}
          </div>
          {isMobile && panelState === "minimised" && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{ backgroundColor: `${activeMode.color}18`, color: activeMode.color, boxShadow: `0 0 0 1px ${activeMode.color}30` }}>
              {activeMode.emoji} {activeMode.label}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Language selector */}
          <select
            value={speechLang}
            onChange={(e) => setSpeechLang(e.target.value as SpeechLang)}
            className="h-7 rounded-lg bg-white/5 border border-white/10 text-muted-foreground text-[10px] px-1.5 focus:outline-none cursor-pointer hover:bg-white/8 transition-colors"
            title={SPEECH_LANGS.find(l => l.value === speechLang)?.label ?? "Speech language"}
          >
            {SPEECH_LANGS.map(l => (
              <option key={l.value} value={l.value}>{l.flag} {l.label}</option>
            ))}
          </select>

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
          {/* Mobile expand/collapse toggle */}
          {isMobile && (
            <button
              onClick={cyclePanelState}
              className="flex-none w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/8 text-muted-foreground hover:text-foreground"
              title={panelState === "balanced" ? "Maximise" : panelState === "maximised" ? "Minimise" : "Reset"}
            >
              {panelState === "maximised" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                  <line x1="10" y1="14" x2="21" y2="3" /><line x1="3" y1="21" x2="14" y2="10" />
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

      {/* Collapsed state — show nothing else when minimised on mobile */}
      {isMobile && panelState === "minimised" ? null : (<>

      {/* ── Mode tabs ── */}
      {/* Mobile: compact dropdown */}
      {isMobile && (
        <div className="flex-none px-3 py-2 border-b border-white/6">
          <ModeDropdown
            modes={MODES}
            activeMode={activeMode}
            onSelect={(id) => {
              const mode = MODES.find((m) => m.id === id);
              if (mode) {
                setActiveMode(mode);
                if (isOpen) handleEndSession();
              }
            }}
          />
        </div>
      )}
      {/* Desktop: scrollable pill bar */}
      {!isMobile && <div className="flex-none border-b border-white/6 bg-black/15">
        <div className="relative">
          {/* Left arrow */}
          {canScrollLeft && (
            <button
              onClick={() => scrollModeBar("left")}
              className="absolute left-0 top-0 h-full z-10 px-1.5 flex items-center text-muted-foreground hover:text-foreground transition-colors"
              style={{ background: "linear-gradient(to right, var(--background) 60%, transparent)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
          {/* Edge fades */}
          {canScrollLeft && (
            <div className="absolute left-6 top-0 h-full w-6 pointer-events-none z-[5]"
              style={{ background: "linear-gradient(to right, rgba(0,0,0,0.3), transparent)" }} />
          )}
          {canScrollRight && (
            <div className="absolute right-6 top-0 h-full w-6 pointer-events-none z-[5]"
              style={{ background: "linear-gradient(to left, rgba(0,0,0,0.3), transparent)" }} />
          )}
          {/* Scrollable pill strip */}
          <div
            ref={modeBarRef}
            className="flex gap-1 py-2 select-none"
            style={{
              overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none",
              cursor: "grab", scrollBehavior: "smooth",
              paddingLeft: canScrollLeft ? "26px" : "12px",
              paddingRight: canScrollRight ? "26px" : "12px",
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
                  onClick={() => {
                    if (dragState.current.moved >= 5) return;
                    setActiveMode(mode);
                    if (isOpen) handleEndSession();
                  }}
                  className="flex-none flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium whitespace-nowrap transition-all"
                  style={isActive
                    ? { backgroundColor: `${mode.color}20`, color: mode.color, boxShadow: `0 0 0 1px ${mode.color}45` }
                    : { color: "var(--muted-foreground)" }}
                >
                  <span>{mode.emoji}</span>
                  {mode.label}
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
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
        </div>
        {isOpen && (
          <p className="text-center text-[9px] text-muted-foreground/50 pb-1.5">
            Switching mode ends the current session
          </p>
        )}
      </div>}

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
      {(connectError ?? externalError) && (
        <div className="flex-none mx-4 mb-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
          {connectError ?? externalError}
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
          {isReconnecting ? "Reconnecting…" : isConnecting ? "Connecting to EVI…" : isOpen ? "Tap to end session" : "Tap mic to start"}
        </p>

        <div className="flex items-center gap-1 mt-1 opacity-40">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="text-muted-foreground">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
          <span className="text-[9px] text-muted-foreground tracking-wide">Powered by Hume EVI</span>
        </div>
      </div>

      </>)}

      {/* ── Prompt editor modal ── */}
      {editingModeId && (() => {
        const mode = MODES.find((m) => m.id === editingModeId)!;
        const isModified = !!editDraft.trim() && editDraft.trim() !== mode.systemPrompt;
        return (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setEditingModeId(null); }}
          >
            <div className="w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden"
              style={{ backgroundColor: "#0d0d12" }}>
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/8">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-lg flex-none"
                  style={{ backgroundColor: `${mode.color}18` }}>
                  {mode.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{mode.label} — System Prompt</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Customize how this mode responds</p>
                </div>
                <button onClick={() => setEditingModeId(null)} className="flex-none text-muted-foreground hover:text-foreground transition-colors p-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-4 py-3.5">
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={7}
                  autoFocus
                  className="w-full resize-none rounded-xl text-xs px-3.5 py-3 focus:outline-none transition-all leading-relaxed"
                  style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: "var(--foreground)" }}
                  placeholder="Enter the system prompt for this mode…"
                />
                <div className="flex justify-between items-center mt-1.5">
                  <span className="text-[10px] text-muted-foreground">{editDraft.length} chars</span>
                  {isModified && <span className="text-[10px] font-medium" style={{ color: mode.color }}>● Customized</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-3 border-t border-white/8">
                <button
                  onClick={() => setEditDraft(mode.systemPrompt)}
                  className="text-[11px] text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-all"
                >
                  Reset
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => setEditingModeId(null)}
                  className="text-[11px] px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/8 text-muted-foreground hover:text-foreground transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={savePrompt}
                  className="text-[11px] px-3.5 py-1.5 rounded-lg font-medium text-foreground transition-all"
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

type VoiceGender = "masculine" | "feminine";

const VOICE_LABELS: Record<VoiceGender, { label: string; subtitle: string; icon: string }> = {
  masculine: { label: "Male",   subtitle: "ITO",  icon: "♂" },
  feminine:  { label: "Female", subtitle: "KORA", icon: "♀" },
};

// ── Outer wrapper ─────────────────────────────────────────────────────────────
export default function HumeVoiceMode({ onVoiceEmotion, onExitVoice, sessionId: _sessionId, faceEmotionCounts, onMobileStateChange }: Props) {
  const [voiceGender, setVoiceGender] = useState<VoiceGender>("feminine");
  const [config, setConfig] = useState<HumeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [eviError, setEviError] = useState<string | null>(null);

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
    <VoiceProvider
      clearMessagesOnDisconnect
      onMessage={handleRawMessage}
      onError={(err: { message?: string }) => {
        const msg = err.message ?? "Microphone or connection error. Check mic permissions.";
        setEviError(msg);
      }}
    >
      <EviInner
        apiKey={config.apiKey}
        configId={config.configId}
        onVoiceEmotion={onVoiceEmotion}
        onExitVoice={onExitVoice}
        faceEmotionCounts={faceEmotionCounts}
        voiceGender={voiceGender}
        onVoiceGenderChange={setVoiceGender}
        externalError={eviError}
        onMobileStateChange={onMobileStateChange}
      />
    </VoiceProvider>
  );
}
