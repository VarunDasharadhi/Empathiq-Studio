import { useState, useEffect, useCallback, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WebcamEmotion from "@/components/WebcamEmotion";
import ChatInterface from "@/components/ChatInterface";
import SessionHistory, { type Session } from "@/components/SessionHistory";
import SessionReplay from "@/components/SessionReplay";
import HumeVoiceMode from "@/components/HumeVoiceMode";
import SmartGlassesPanel from "@/components/SmartGlassesPanel";

const queryClient = new QueryClient();

export type Emotion =
  | "happy" | "sad" | "angry" | "fearful"
  | "disgusted" | "surprised" | "neutral" | null;

type RightPanel = "chat" | "voice" | "glasses" | "history" | "replay";

const EMOTION_VALENCE: Record<string, "positive" | "negative" | "neutral"> = {
  happy: "positive", surprised: "positive", joy: "positive", excited: "positive",
  amusement: "positive", awe: "positive",
  neutral: "neutral", calmness: "neutral", confusion: "neutral",
  sad: "negative", angry: "negative", fearful: "negative", disgusted: "negative",
  anxiety: "negative", distress: "negative", pain: "negative", contempt: "negative",
};

export function getOverallEmotion(face: string | null, voice: string | null): string {
  if (!face && !voice) return "none";
  if (!face) return voice!;
  if (!voice) return face;
  if (face === voice) return face;
  const fv = EMOTION_VALENCE[face] ?? "neutral";
  const vv = EMOTION_VALENCE[voice.toLowerCase()] ?? "neutral";
  if (fv === "neutral") return voice;
  if (vv === "neutral") return face;
  if (fv === vv) return face;
  return "mixed";
}

const NAV_TABS: Array<{ id: RightPanel; emoji: string; label: string; color: string }> = [
  { id: "chat",    emoji: "💬", label: "Chat",         color: "#8b5cf6" },
  { id: "voice",   emoji: "🎙️", label: "Voice",        color: "#a78bfa" },
  { id: "glasses", emoji: "🥽", label: "Smart Glasses", color: "#34d399" },
  { id: "history", emoji: "📜", label: "History",       color: "#f59e0b" },
];

function App() {
  const [appReady, setAppReady] = useState(false);
  const [faceEmotion, setFaceEmotion] = useState<Emotion>(null);
  const [voiceEmotion, setVoiceEmotion] = useState<string | null>(null);
  const [voiceEmotionScores, setVoiceEmotionScores] = useState<Record<string, number> | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>("chat");
  const [replaySession, setReplaySession] = useState<Session | null>(null);
  const [checkIn, setCheckIn] = useState<{ id: string; text: string } | null>(null);
  const [coachingText, setCoachingText] = useState<string | null>(null);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [glassesContext, setGlassesContext] = useState("general");
  const [mobilePanelState, setMobilePanelState] = useState<"balanced" | "maximised" | "minimised">("balanced");
  const emotionCountRef = useRef<Record<string, number>>({});

  const createSession = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions", { method: "POST" });
      if (!res.ok) return;
      const session = await res.json() as { id: number };
      setSessionId(session.id);
      emotionCountRef.current = {};
    } catch { /* non-critical */ }
  }, []);

  const endSession = useCallback(async (id: number) => {
    const counts = emotionCountRef.current;
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const title = dominant
      ? `${dominant.charAt(0).toUpperCase() + dominant.slice(1)} session`
      : "Session";
    try {
      await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, dominantEmotion: dominant ?? null }),
      });
      fetch(`/api/sessions/${id}/summary`, { method: "POST" }).catch(() => {});
    } catch { /* non-critical */ }
  }, []);

  const handleFaceEmotionChange = useCallback((e: Emotion) => {
    setFaceEmotion(e);
    if (e) emotionCountRef.current[e] = (emotionCountRef.current[e] ?? 0) + 1;
  }, []);

  const handleVoiceEmotion = useCallback((emotion: string | null, scores: Record<string, number> | null) => {
    setVoiceEmotion(emotion);
    setVoiceEmotionScores(scores);
  }, []);

  const handleSustainedNegative = useCallback(async (emotion: string, durationSeconds: number) => {
    if (rightPanel !== "chat") return;
    try {
      const res = await fetch("/api/proactive-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emotion, durationSeconds }),
      });
      const data = await res.json() as { message: string | null };
      if (data.message) {
        setCheckIn({ id: `checkin-${Date.now()}`, text: data.message });
      }
    } catch { /* non-critical */ }
  }, [rightPanel]);

  useEffect(() => {
    const timer = setTimeout(() => setAppReady(true), 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => { createSession(); }, [createSession]);

  const handleNewSession = useCallback(async () => {
    if (sessionId) await endSession(sessionId);
    await createSession();
    setRightPanel("chat");
  }, [sessionId, endSession, createSession]);

  const handleSelectSession = useCallback((session: Session) => {
    setReplaySession(session);
    setRightPanel("replay");
  }, []);

  const handleBackFromReplay = useCallback(() => {
    setReplaySession(null);
    setRightPanel("history");
  }, []);

  const handleCoachingText = useCallback((text: string) => {
    setCoachingText(text);
    setCoachingLoading(false);
  }, []);

  // Reset mobile panel state when switching tabs
  useEffect(() => {
    setMobilePanelState("balanced");
  }, [rightPanel]);

  // When entering glasses tab, reset coaching state
  useEffect(() => {
    if (rightPanel === "glasses") {
      setCoachingText(null);
      setCoachingLoading(true);
    } else if (rightPanel === "voice") {
      setVoiceEmotion(null);
      setVoiceEmotionScores(null);
    }
  }, [rightPanel]);

  const activeTab = rightPanel === "replay" ? "history" : rightPanel;

  return (
    <QueryClientProvider client={queryClient}>
      {!appReady && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#07080d] gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-semibold text-foreground">EmpathIQ</p>
            <p className="text-xs text-muted-foreground">Loading emotional AI…</p>
          </div>
        </div>
      )}
      <div className="flex flex-col h-full w-full overflow-hidden app-gradient-bg">

        {/* ── Nav bar ── */}
        <div className="flex-none bg-black/30 backdrop-blur-md z-10 border-b border-white/8">
          {/* Brand row */}
          <div className="flex items-center justify-between px-5 py-2">
            <a href="/" className="flex items-center gap-2.5 no-underline hover:opacity-80 transition-opacity">
              <img src="/logo.png" width="32" height="32" alt="EmpathIQ" style={{ objectFit: 'contain' }} />
              <div className="flex flex-col leading-none">
                <span className="text-xs font-bold tracking-wide text-foreground">EmpathIQ</span>
                <span className="text-[8px] text-muted-foreground/60 tracking-widest uppercase mt-0.5">Emotional AI</span>
              </div>
            </a>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/8">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] text-primary/80 font-medium">Live</span>
            </div>
          </div>

          {/* Tab row */}
          <div className="flex items-stretch px-1">
            {NAV_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === "history") { setReplaySession(null); }
                    setRightPanel(tab.id);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold relative transition-all"
                  style={{
                    color: isActive ? tab.color : "rgba(156,163,175,0.7)",
                  }}
                >
                  <span className="text-sm leading-none">{tab.emoji}</span>
                  <span className="hidden sm:inline">{tab.label}</span>

                  {/* Glowing underline */}
                  <div
                    className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full transition-all duration-300"
                    style={{
                      backgroundColor: isActive ? tab.color : "transparent",
                      boxShadow: isActive ? `0 0 8px ${tab.color}` : "none",
                      opacity: isActive ? 1 : 0,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Split layout ── */}
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          {/* Left — webcam + emotion detection */}
          <div
            className={[
              "md:w-1/2 md:h-full md:border-r md:border-b-0 border-b border-white/8 flex flex-col flex-none panel-state-transition",
              mobilePanelState === "maximised"
                ? "h-0 overflow-hidden opacity-0 pointer-events-none md:h-full md:overflow-visible md:opacity-100 md:pointer-events-auto"
                : mobilePanelState === "minimised"
                  ? "flex-1 md:flex-none md:w-1/2 md:h-full"
                  : "h-[42%] md:h-full",
            ].join(" ")}
          >
            <WebcamEmotion
              onEmotionChange={handleFaceEmotionChange}
              onSustainedNegative={handleSustainedNegative}
              sessionId={sessionId}
              voiceEmotion={voiceEmotion}
              voiceEmotionScores={voiceEmotionScores}
              glassesMode={rightPanel === "glasses"}
              onCoachingText={handleCoachingText}
              glassesContext={glassesContext}
            />
          </div>

          {/* Right — panel */}
          <div
            className={[
              "md:w-1/2 md:h-full flex flex-col min-h-0 panel-state-transition",
              mobilePanelState === "minimised" ? "flex-none" : "flex-1",
            ].join(" ")}
          >
            {rightPanel === "chat" && (
              <ChatInterface
                currentEmotion={faceEmotion}
                sessionId={sessionId}
                checkIn={checkIn}
                onDismissCheckIn={() => setCheckIn(null)}
                onModeChange={() => {}}
                onMobileStateChange={setMobilePanelState}
              />
            )}
            {rightPanel === "voice" && (
              <HumeVoiceMode
                onVoiceEmotion={handleVoiceEmotion}
                onExitVoice={() => { setRightPanel("chat"); setVoiceEmotion(null); setVoiceEmotionScores(null); }}
                sessionId={sessionId}
                faceEmotionCounts={emotionCountRef.current}
                onMobileStateChange={setMobilePanelState}
              />
            )}
            {rightPanel === "glasses" && (
              <SmartGlassesPanel
                detectedEmotion={faceEmotion}
                coachingText={coachingText}
                coachingLoading={coachingLoading}
                sessionId={sessionId}
                onMobileStateChange={setMobilePanelState}
                onContextChange={setGlassesContext}
              />
            )}
            {rightPanel === "history" && (
              <SessionHistory
                currentSessionId={sessionId}
                onSelectSession={handleSelectSession}
                onNewSession={handleNewSession}
              />
            )}
            {rightPanel === "replay" && replaySession && (
              <SessionReplay session={replaySession} onBack={handleBackFromReplay} />
            )}
          </div>
        </div>
      </div>
    </QueryClientProvider>
  );
}

export default App;
