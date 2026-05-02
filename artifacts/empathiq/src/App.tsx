import { useState, useEffect, useCallback, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WebcamEmotion from "@/components/WebcamEmotion";
import ChatInterface from "@/components/ChatInterface";
import SessionHistory, { type Session } from "@/components/SessionHistory";
import SessionReplay from "@/components/SessionReplay";
import HumeVoiceMode from "@/components/HumeVoiceMode";

const queryClient = new QueryClient();

export type Emotion =
  | "happy" | "sad" | "angry" | "fearful"
  | "disgusted" | "surprised" | "neutral" | null;

type RightPanel = "chat" | "history" | "replay" | "voice";

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

function App() {
  const [faceEmotion, setFaceEmotion] = useState<Emotion>(null);
  const [voiceEmotion, setVoiceEmotion] = useState<string | null>(null);
  const [voiceEmotionScores, setVoiceEmotionScores] = useState<Record<string, number> | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>("chat");
  const [replaySession, setReplaySession] = useState<Session | null>(null);
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

  const handleVoiceToggle = useCallback(async () => {
    if (rightPanel === "voice") {
      setRightPanel("chat");
      setVoiceEmotion(null);
      setVoiceEmotionScores(null);
    } else {
      setRightPanel("voice");
    }
  }, [rightPanel]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex flex-col h-full w-full overflow-hidden app-gradient-bg">
        {/* Header bar */}
        <div className="flex-none flex items-center justify-between px-5 py-3 border-b border-white/8 bg-black/20 backdrop-blur-md z-10">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="logo-glow w-8 h-8 rounded-xl bg-gradient-to-br from-primary/30 to-violet-500/20 border border-primary/30 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-primary">
                <path d="M12 20.5c-5.25-4.8-10-9-10-13A5 5 0 0 1 12 4.93 5 5 0 0 1 22 7.5c0 4-4.75 8.2-10 13z" fill="currentColor" opacity="0.85" />
                <path d="M9 9c0-1.1.9-2 2-2s2 .9 2 2" stroke="hsl(var(--primary-foreground))" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.6"/>
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-wide text-foreground leading-none">EmpathIQ</span>
              <span className="text-[9px] text-muted-foreground/70 leading-none mt-0.5 tracking-wider uppercase">Emotional AI</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Chat tab */}
            <button
              onClick={() => { setRightPanel("chat"); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                rightPanel === "chat"
                  ? "bg-primary/15 text-primary shadow-sm shadow-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Chat
            </button>

            {/* Voice Mode tab */}
            <button
              onClick={handleVoiceToggle}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                rightPanel === "voice"
                  ? "bg-violet-500/20 text-violet-300 shadow-sm shadow-violet-500/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              {rightPanel === "voice" ? "Exit Voice" : "Voice Mode"}
            </button>

            {/* History tab */}
            <button
              onClick={() => { setRightPanel("history"); setReplaySession(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                rightPanel === "history" || rightPanel === "replay"
                  ? "bg-primary/15 text-primary shadow-sm shadow-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              </svg>
              History
            </button>

            <div className="w-px h-4 bg-white/10 mx-1" />

            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/8">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs text-primary/80 font-medium">Live</span>
            </div>
          </div>
        </div>

        {/* Split layout */}
        <div className="flex flex-1 min-h-0">
          {/* Left — webcam + emotion detection */}
          <div className="w-1/2 h-full border-r border-white/8 flex flex-col">
            <WebcamEmotion
              onEmotionChange={handleFaceEmotionChange}
              sessionId={sessionId}
              voiceEmotion={voiceEmotion}
              voiceEmotionScores={voiceEmotionScores}
            />
          </div>

          {/* Right — chat / voice / history */}
          <div className="w-1/2 h-full flex flex-col">
            {rightPanel === "chat" && (
              <ChatInterface currentEmotion={faceEmotion} sessionId={sessionId} />
            )}
            {rightPanel === "voice" && (
              <HumeVoiceMode
                onVoiceEmotion={handleVoiceEmotion}
                sessionId={sessionId}
                faceEmotionCounts={emotionCountRef.current}
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
