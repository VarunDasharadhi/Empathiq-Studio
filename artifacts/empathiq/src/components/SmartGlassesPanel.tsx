import { useState, useRef, useEffect, useCallback } from "react";
import type { Emotion } from "@/App";

const EMOTION_CONFIG: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  happy:     { label: "Happy",     color: "#facc15", bg: "rgba(250,204,21,0.12)",  desc: "They seem happy and open" },
  sad:       { label: "Sad",       color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  desc: "They seem sad or withdrawn" },
  angry:     { label: "Angry",     color: "#f87171", bg: "rgba(248,113,113,0.12)", desc: "They seem frustrated or tense" },
  fearful:   { label: "Anxious",   color: "#c084fc", bg: "rgba(192,132,252,0.12)", desc: "They seem nervous or uncertain" },
  disgusted: { label: "Disgusted", color: "#4ade80", bg: "rgba(74,222,128,0.12)",  desc: "They seem put off or uncomfortable" },
  surprised: { label: "Surprised", color: "#fb923c", bg: "rgba(251,146,60,0.12)",  desc: "They seem caught off guard" },
  neutral:   { label: "Neutral",   color: "#9ca3af", bg: "rgba(156,163,175,0.12)", desc: "They seem calm and composed" },
};

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface Props {
  detectedEmotion: Emotion;
  coachingText: string | null;
  coachingLoading: boolean;
  sessionId: number | null;
}

export default function SmartGlassesPanel({ detectedEmotion, coachingText, coachingLoading, sessionId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [coachKey, setCoachKey] = useState(0);
  const prevCoachRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Animate in new coaching text
  useEffect(() => {
    if (coachingText && coachingText !== prevCoachRef.current) {
      prevCoachRef.current = coachingText;
      setCoachKey((k) => k + 1);
    }
  }, [coachingText]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const userMsg: ChatMessage = { role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const emotionCtx = detectedEmotion
        ? `The person in front of me appears to be ${EMOTION_CONFIG[detectedEmotion]?.label ?? detectedEmotion}. `
        : "";
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `${emotionCtx}${text}`,
          emotion: detectedEmotion,
          mode: "smart-glasses",
          sessionId,
        }),
      });
      const data = await res.json() as { reply: string };
      setMessages((prev) => [...prev, { role: "assistant", text: data.reply ?? "…" }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Couldn't reach EmpathIQ right now." }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, detectedEmotion, sessionId]);

  const emotionCfg = detectedEmotion ? EMOTION_CONFIG[detectedEmotion] : null;

  return (
    <div className="flex flex-col h-full bg-[#07090e]">

      {/* ── Header ── */}
      <div className="flex-none px-4 pt-4 pb-3 border-b border-white/8">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/20 flex items-center justify-center text-xl flex-none">
            🥽
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Smart Glasses</p>
            <p className="text-[10px] text-muted-foreground">Reading the person in front of you</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-lg"
            style={{ backgroundColor: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)" }}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-medium text-emerald-400">Active</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin flex flex-col gap-3 px-4 py-3">

        {/* ── Detected Emotion Card ── */}
        <div
          className="rounded-2xl p-4 flex items-center gap-4"
          style={{
            backgroundColor: emotionCfg?.bg ?? "rgba(255,255,255,0.04)",
            border: `1px solid ${emotionCfg?.color ?? "#ffffff"}22`,
          }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-none"
            style={{ backgroundColor: `${emotionCfg?.color ?? "#9ca3af"}18` }}
          >
            {detectedEmotion === "happy" ? "😊"
              : detectedEmotion === "sad" ? "😔"
              : detectedEmotion === "angry" ? "😠"
              : detectedEmotion === "fearful" ? "😰"
              : detectedEmotion === "disgusted" ? "😒"
              : detectedEmotion === "surprised" ? "😲"
              : detectedEmotion ? "😐"
              : "👁️"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Detected Emotion</p>
            {detectedEmotion && emotionCfg ? (
              <>
                <p className="text-xl font-bold leading-tight" style={{ color: emotionCfg.color }}>
                  {emotionCfg.label}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{emotionCfg.desc}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic">Scanning…</p>
            )}
          </div>
        </div>

        {/* ── Coaching Suggestion ── */}
        <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/6">
            <div className="w-5 h-5 rounded-lg bg-emerald-500/15 flex items-center justify-center text-xs">💡</div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">EmpathIQ Suggests</p>
            {coachingLoading && (
              <div className="ml-auto w-3 h-3 rounded-full border border-emerald-400/40 border-t-emerald-400 animate-spin" />
            )}
          </div>
          <div className="px-3.5 py-3 min-h-[56px] flex items-center">
            {coachingText ? (
              <p
                key={coachKey}
                className="text-sm leading-relaxed text-foreground/90"
                style={{ animation: "eiFadeIn 0.4s ease-out" }}
              >
                {coachingText}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">
                {detectedEmotion ? "Generating suggestion…" : "Point camera at someone to start"}
              </p>
            )}
          </div>
        </div>

        {/* ── Quick tips ── */}
        {messages.length === 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold px-0.5">Ask EmpathIQ</p>
            {[
              "What's the best way to approach them right now?",
              "How do I start the conversation?",
              "What should I avoid saying?",
            ].map((q) => (
              <button
                key={q}
                onClick={() => { setInput(q); }}
                className="w-full text-left text-xs px-3.5 py-2.5 rounded-xl border border-white/8 bg-white/3 hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* ── Chat messages ── */}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                <span className="text-xs">🥽</span>
              </div>
            )}
            <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
              msg.role === "user"
                ? "bg-emerald-500/20 text-emerald-100 rounded-br-sm border border-emerald-400/20"
                : "bg-white/5 border border-white/8 text-foreground rounded-bl-sm"
            }`}>
              {msg.text}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0 mr-2">
              <span className="text-xs">🥽</span>
            </div>
            <div className="bg-white/5 border border-white/8 rounded-xl rounded-bl-sm px-3.5 py-2.5">
              <div className="flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <div className="flex-none px-4 pb-4 pt-2 border-t border-white/8">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
            rows={1}
            placeholder="Ask for advice…"
            className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-xs focus:outline-none leading-relaxed"
            style={{
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "var(--foreground)",
              minHeight: 38,
              maxHeight: 80,
            }}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || sending}
            className="flex-none w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-40"
            style={{ backgroundColor: "rgba(52,211,153,0.2)", border: "1px solid rgba(52,211,153,0.3)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
