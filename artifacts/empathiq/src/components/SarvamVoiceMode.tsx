import { useState, useRef, useCallback, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import LanguageSelector from "@/components/LanguageSelector";
import ModeDropdown from "@/components/ModeDropdown";
import { LANGUAGES, type LangCode } from "@/App";

// ── Indian language voice map ─────────────────────────────────────────────────
const SARVAM_VOICE: Record<"feminine" | "masculine", string> = {
  feminine: "ritu",
  masculine: "aditya",
};

// ── Modes (same spoken-delivery prompts as EVI) ───────────────────────────────
interface Mode {
  id: string;
  label: string;
  emoji: string;
  color: string;
  systemPrompt: string;
}

const MODES: Mode[] = [
  { id: "therapist", label: "Companion", emoji: "🫂", color: "#818cf8",
    systemPrompt: "You are EmpathIQ in Companion mode, a gentle voice companion. When the person's face shows something their words don't say, name it softly. Never start with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Sit with what they're feeling before offering anything. Ask one question at a time. Short warm sentences. No lists or formatting. Two to four sentences at most." },
  { id: "dating", label: "Dating Coach", emoji: "💘", color: "#f472b6",
    systemPrompt: "You are EmpathIQ in Dating Coach mode, a playful and direct voice companion. When the person's face shows nerves while they're playing it cool, call it out warmly. Never start with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Skip pep talks. Ask one specific question. Short sentences. No lists. Two to four sentences." },
  { id: "sales", label: "Sales Coach", emoji: "💼", color: "#34d399",
    systemPrompt: "You are EmpathIQ in Sales Coach mode, a sharp and encouraging voice companion. When the person looks stressed, acknowledge fast and redirect. Never start with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Direct, no fluff, one focused question. Short sentences. No lists. Two to four sentences." },
  { id: "meditation", label: "Meditation", emoji: "🧘", color: "#67e8f9",
    systemPrompt: "You are EmpathIQ in Meditation mode, a slow and spacious voice companion. Meet the person where they are before guiding. Never start with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Speak slowly, gently. Short phrases. No lists. Two to four sentences." },
  { id: "anger-release", label: "Anger Release", emoji: "😤", color: "#f87171",
    systemPrompt: "You are EmpathIQ in Anger Release mode, a validating and grounding voice companion. Let them vent. Match their intensity calmly. Never start with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Don't rush to fix anything. Short sentences. No lists. Two to four sentences." },
  { id: "focus-coach", label: "Focus Coach", emoji: "🎯", color: "#fbbf24",
    systemPrompt: "You are EmpathIQ in Focus Coach mode, an energetic and direct voice companion. When the person looks scattered, match and redirect fast. Never start with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Short punchy sentences. Direct questions. No lists. Two to four sentences." },
  { id: "sleep-guide", label: "Sleep Guide", emoji: "🌙", color: "#818cf8",
    systemPrompt: "You are EmpathIQ in Sleep Guide mode, a soft and quiet voice companion. Ease into the person's space. Never start with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Speak like you're already winding down. Short gentle sentences. No lists. Two to four sentences." },
  { id: "confidence-booster", label: "Confidence Booster", emoji: "💪", color: "#fb923c",
    systemPrompt: "You are EmpathIQ in Confidence Booster mode, a hyped and honest voice companion. When the person looks low, name it and lift it. Never start with \"I understand,\" \"That's completely valid,\" or \"It sounds like.\" Warm, convicted, energising. Short punchy sentences. No lists. Two to four sentences." },
  { id: "roast", label: "Roast Mode", emoji: "🔥", color: "#f97316",
    systemPrompt: "You are EmpathIQ in Roast Mode, a playful voice companion who delivers sharp affectionate roasts out loud. When the person's face shows something their words don't, call it out with a teasing quip. Keep roasts punchy, warm, and funny, never cruel. You are speaking out loud so make your roasts punchy and conversational. Keep it to two sentences max since longer roasts lose impact when spoken. No bullet points, no markdown." },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface TxMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
}

interface Props {
  selectedLang: LangCode;
  onLangChange: (code: LangCode) => void;
  voiceGender: "masculine" | "feminine";
  onVoiceGenderChange: (g: "masculine" | "feminine") => void;
  onMobileStateChange?: (state: "balanced" | "maximised" | "minimised") => void;
}

// ── Sound wave animation ──────────────────────────────────────────────────────
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function SarvamVoiceMode({
  selectedLang, onLangChange,
  voiceGender, onVoiceGenderChange,
  onMobileStateChange,
}: Props) {
  const isMobile = useIsMobile();
  const [activeMode, setActiveMode] = useState<Mode>(MODES[0]);
  const [panelState, setPanelState] = useState<"balanced" | "maximised" | "minimised">("balanced");
  const [transcript, setTranscript] = useState<TxMsg[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptRef = useRef<TxMsg[]>([]);
  const activeModeRef = useRef<Mode>(MODES[0]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep refs in sync
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, isProcessing]);

  const lang = LANGUAGES.find((l) => l.code === selectedLang);
  const sarvamLang = lang?.locale ?? "hi-IN";
  const sarvamSpeaker = SARVAM_VOICE[voiceGender];
  const isRoast = activeMode.id === "roast";

  const cyclePanelState = useCallback(() => {
    setPanelState((prev) => {
      const next = prev === "balanced" ? "maximised" : prev === "maximised" ? "minimised" : "balanced";
      onMobileStateChange?.(next);
      return next;
    });
  }, [onMobileStateChange]);

  const stopCurrentAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = "";
      currentAudioRef.current = null;
      setIsSpeaking(false);
    }
  }, []);

  const playBase64Audio = useCallback(async (base64: string) => {
    stopCurrentAudio();
    // Sarvam returns WAV PCM; try wav first, fall back to mpeg
    const audio = new Audio(`data:audio/wav;base64,${base64}`);
    currentAudioRef.current = audio;
    setIsSpeaking(true);
    audio.onended = () => { setIsSpeaking(false); currentAudioRef.current = null; };
    audio.onerror = () => { setIsSpeaking(false); currentAudioRef.current = null; };
    try { await audio.play(); } catch { setIsSpeaking(false); }
  }, [stopCurrentAudio]);

  const processAudio = useCallback(async (audioBlob: Blob) => {
    setIsProcessing(true);
    setError(null);
    const mode = activeModeRef.current;
    const history = transcriptRef.current;

    try {
      // ── 1. STT ───────────────────────────────────────────────────────────
      const sttRes = await fetch(`/api/sarvam/stt?lang=${sarvamLang}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: audioBlob,
      });

      if (!sttRes.ok) throw new Error("Speech recognition failed — check SARVAM_API_KEY");
      const sttData = await sttRes.json() as { transcript?: string };
      const userText = sttData.transcript?.trim() ?? "";

      if (!userText) {
        setIsProcessing(false);
        return;
      }

      const userMsg: TxMsg = { id: `u-${Date.now()}`, role: "user", text: userText };
      setTranscript((prev) => [...prev, userMsg]);

      // ── 2. Claude ────────────────────────────────────────────────────────
      const langNote = lang
        ? `\nSpeak and respond only in ${lang.name}. Use natural conversational ${lang.name} as a native speaker would. Keep responses under 3 sentences for voice delivery.`
        : "";
      const systemPrompt = `${mode.systemPrompt}${langNote}`;

      const chatMessages = [
        ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.text })),
        { role: "user" as const, content: userText },
      ];

      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatMessages, systemPrompt }),
      });

      if (!chatRes.ok) throw new Error("AI response failed");
      const chatData = await chatRes.json() as { content?: string };
      const assistantText = chatData.content?.trim() ?? "Sorry, I could not respond.";

      const assistantMsg: TxMsg = { id: `a-${Date.now()}`, role: "assistant", text: assistantText };
      setTranscript((prev) => [...prev, assistantMsg]);
      setIsProcessing(false);

      // ── 3. TTS ───────────────────────────────────────────────────────────
      const ttsRes = await fetch("/api/sarvam/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: assistantText, language_code: sarvamLang, speaker: sarvamSpeaker }),
      });

      if (ttsRes.ok) {
        const ttsData = await ttsRes.json() as { audio?: string };
        if (ttsData.audio) await playBase64Audio(ttsData.audio);
      }
    } catch (err) {
      setIsProcessing(false);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [sarvamLang, sarvamSpeaker, lang, playBase64Audio]);

  const startRecording = useCallback(async () => {
    setError(null);
    stopCurrentAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/ogg;codecs=opus";

      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size > 500) void processAudio(blob);
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setError("Microphone access denied — please allow microphone access and try again.");
    }
  }, [stopCurrentAudio, processAudio]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  }, []);

  const handleToggle = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else if (isSpeaking) {
      stopCurrentAudio();
    } else if (!isProcessing) {
      void startRecording();
    }
  }, [isRecording, isSpeaking, isProcessing, stopRecording, stopCurrentAudio, startRecording]);

  const micColor = isRecording ? "#f87171"
    : isProcessing ? "#fbbf24"
    : isSpeaking ? "#34d399"
    : activeMode.color;

  const statusText = isRecording ? "Listening… tap to stop"
    : isProcessing ? "Thinking…"
    : isSpeaking ? "Speaking… tap to skip"
    : "Tap mic to speak";

  return (
    <div
      className="flex flex-col h-full bg-background/60 backdrop-blur-sm"
      style={isRoast ? { boxShadow: "inset 0 0 0 1.5px rgba(249,115,22,0.45), inset 0 0 60px rgba(249,115,22,0.06)" } : undefined}
    >
      {/* ── Header ── */}
      <div className="flex-none flex items-center justify-between px-3 py-2 md:px-4 md:py-2.5 border-b border-white/8 bg-black/20">
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <p className="text-xs font-semibold text-foreground">EVI Voice Mode</p>
            {panelState !== "minimised" && (
              <p className="text-[10px] text-muted-foreground hidden sm:block">Sarvam AI · Claude</p>
            )}
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
          <LanguageSelector value={selectedLang} onChange={onLangChange} />

          {/* Voice gender toggle */}
          <div className="flex items-center rounded-lg overflow-hidden border border-white/10 text-[10px] font-medium">
            {(["feminine", "masculine"] as const).map((g) => {
              const active = voiceGender === g;
              return (
                <button
                  key={g}
                  onClick={() => { if (!active) { stopCurrentAudio(); stopRecording(); onVoiceGenderChange(g); } }}
                  className="flex items-center gap-1 px-2.5 py-1 transition-all"
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

          {/* Mobile expand/collapse */}
          {isMobile && (
            <button
              onClick={cyclePanelState}
              className="flex-none w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/8 text-muted-foreground hover:text-foreground"
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

      {/* ── Body ── */}
      <div className="panel-body-grid flex-1 min-h-0">
      <div className="panel-body-inner">

      {/* Roast disclaimer */}
      {isRoast && (
        <div className="flex-none mx-4 mt-2 px-3 py-1.5 rounded-lg flex items-center gap-2"
          style={{ backgroundColor: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.22)" }}>
          <span className="text-sm leading-none">🔥</span>
          <p className="text-[10px] text-orange-300/80 leading-snug">Roast Mode is playful banter. All in good fun.</p>
        </div>
      )}

      {/* Mode selector — mobile */}
      {isMobile && (
        <div className="flex-none px-3 py-2 border-b border-white/6">
          <ModeDropdown
            modes={MODES}
            activeMode={activeMode}
            onSelect={(id) => {
              const m = MODES.find((x) => x.id === id);
              if (m) { stopCurrentAudio(); stopRecording(); setActiveMode(m); }
            }}
          />
        </div>
      )}

      {/* Mode selector — desktop pills */}
      {!isMobile && (
        <div className="flex-none border-b border-white/6 bg-black/15 overflow-x-auto scrollbar-none">
          <div className="flex gap-1 px-3 py-2">
            {MODES.map((mode) => {
              const isActive = mode.id === activeMode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => { stopCurrentAudio(); stopRecording(); setActiveMode(mode); }}
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
              <p className="text-sm font-medium text-foreground">
                {activeMode.label} — {lang?.name ?? ""} Voice
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                Tap the mic and speak in {lang?.name ?? "your language"}. EmpathIQ will understand and respond in the same language.
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
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/8 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
              <div className="flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
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

      {/* ── Controls ── */}
      <div className="flex-none px-6 pb-5 pt-3 flex flex-col items-center gap-2.5 border-t border-white/5">
        {isRecording && <SoundWave color="#f87171" />}

        <button
          onClick={handleToggle}
          disabled={isProcessing}
          className="relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none disabled:opacity-40"
          style={{
            backgroundColor: `${micColor}20`,
            boxShadow: isRecording
              ? `0 0 0 2px ${micColor}, 0 0 28px rgba(248,113,113,0.35)`
              : `0 0 0 1.5px ${micColor}60`,
          }}
        >
          {isProcessing ? (
            <div className="w-5 h-5 rounded-full border-2 border-transparent border-t-violet-400 animate-spin" />
          ) : isRecording ? (
            <div className="w-5 h-5 rounded bg-red-400 opacity-90" />
          ) : isSpeaking ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={micColor} strokeWidth="2" strokeLinecap="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={micColor} strokeWidth="2" strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        <p className="text-xs text-muted-foreground">{statusText}</p>

        {/* Powered by Sarvam badge */}
        <div className="flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-full opacity-70"
          style={{ backgroundColor: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
          <span className="text-[10px]">🇮🇳</span>
          <span className="text-[9px] text-violet-300/80 font-medium tracking-wide">Powered by Sarvam AI</span>
        </div>
      </div>

      </div>
      </div>
    </div>
  );
}
