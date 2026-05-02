import { useState, useEffect, useCallback, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WebcamEmotion from "@/components/WebcamEmotion";
import ChatInterface from "@/components/ChatInterface";
import SessionHistory, { type Session } from "@/components/SessionHistory";
import SessionReplay from "@/components/SessionReplay";

const queryClient = new QueryClient();

export type Emotion =
  | "happy" | "sad" | "angry" | "fearful"
  | "disgusted" | "surprised" | "neutral" | null;

type RightPanel = "chat" | "history" | "replay";

function App() {
  const [emotion, setEmotion] = useState<Emotion>(null);
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
    } catch {
      // non-critical
    }
  }, []);

  const endSession = useCallback(async (id: number) => {
    const counts = emotionCountRef.current;
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const msgs = Object.values(counts).reduce((a, b) => a + b, 0);
    const title = msgs === 0
      ? "Empty Session"
      : dominant
        ? `${dominant.charAt(0).toUpperCase() + dominant.slice(1)} session`
        : "Session";

    try {
      await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, dominantEmotion: dominant ?? null }),
      });
    } catch {
      // non-critical
    }
  }, []);

  // Track emotion counts for dominant emotion calculation
  const handleEmotionChange = useCallback((e: Emotion) => {
    setEmotion(e);
    if (e) {
      emotionCountRef.current[e] = (emotionCountRef.current[e] ?? 0) + 1;
    }
  }, []);

  // Start a session on mount
  useEffect(() => {
    createSession();
  }, [createSession]);

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

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex flex-col h-full w-full bg-background overflow-hidden">
        {/* Header bar */}
        <div className="flex-none flex items-center justify-between px-5 py-3 border-b border-border bg-card/80 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-primary">
                <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402C1 3.518 3.518 1 6.591 1c1.924 0 3.65 1.073 4.409 2.562C11.759 2.073 13.485 1 15.409 1 18.482 1 21 3.518 21 7.191c0 4.105-5.37 8.863-11 14.402z" fill="currentColor" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-wide text-foreground">EmpathIQ</span>
          </div>

          <div className="flex items-center gap-1">
            {/* Chat tab */}
            <button
              onClick={() => setRightPanel("chat")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                rightPanel === "chat"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Chat
            </button>

            {/* History tab */}
            <button
              onClick={() => { setRightPanel("history"); setReplaySession(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                rightPanel === "history" || rightPanel === "replay"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              </svg>
              History
            </button>

            <div className="w-px h-4 bg-border mx-1" />

            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
          </div>
        </div>

        {/* Split layout */}
        <div className="flex flex-1 min-h-0">
          {/* Left — Webcam */}
          <div className="w-1/2 h-full border-r border-border flex flex-col">
            <WebcamEmotion onEmotionChange={handleEmotionChange} sessionId={sessionId} />
          </div>

          {/* Right — Chat / History / Replay */}
          <div className="w-1/2 h-full flex flex-col">
            {rightPanel === "chat" && (
              <ChatInterface currentEmotion={emotion} sessionId={sessionId} />
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
