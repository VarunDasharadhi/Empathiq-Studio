import { useState, useRef, useEffect, useCallback } from "react";
import type { Emotion } from "@/App";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  emotion?: Emotion;
}

interface Props {
  currentEmotion: Emotion;
}

const EMOTION_LABELS: Record<string, string> = {
  happy: "Happy",
  sad: "Sad",
  angry: "Angry",
  fearful: "Fearful",
  disgusted: "Disgusted",
  surprised: "Surprised",
  neutral: "Neutral",
};

const EMOTION_COLORS: Record<string, string> = {
  happy: "#facc15",
  sad: "#60a5fa",
  angry: "#f87171",
  fearful: "#c084fc",
  disgusted: "#4ade80",
  surprised: "#fb923c",
  neutral: "#9ca3af",
};

export default function ChatInterface({ currentEmotion }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    const emotionTag = currentEmotion ? `[EMOTION: ${currentEmotion}] ` : "";
    const userContent = `${emotionTag}${text}`;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      emotion: currentEmotion,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsTyping(true);

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
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) throw new Error("API error");

      const data = (await res.json()) as { content: string };

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.content,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I'm having trouble connecting right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  }, [input, isTyping, messages, currentEmotion]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const emotionColor = currentEmotion ? EMOTION_COLORS[currentEmotion] : null;
  const emotionLabel = currentEmotion ? EMOTION_LABELS[currentEmotion] : null;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Chat header */}
      <div className="flex-none flex items-center justify-between px-5 py-3.5 border-b border-border bg-card">
        <div>
          <p className="text-sm font-semibold text-foreground">EmpathIQ Chat</p>
          <p className="text-xs text-muted-foreground mt-0.5">AI calibrated to your emotional state</p>
        </div>
        {emotionColor && emotionLabel && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-500"
            style={{
              backgroundColor: `${emotionColor}20`,
              color: emotionColor,
              boxShadow: `0 0 0 1px ${emotionColor}40`,
            }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: emotionColor }}
            />
            {emotionLabel}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 pb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Start a conversation</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                EmpathIQ reads your facial expression and responds with emotional intelligence
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-[280px]">
              {["How are you feeling today?", "I need someone to talk to.", "Tell me something uplifting."].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInput(s);
                    inputRef.current?.focus();
                  }}
                  className="text-left text-xs px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message-enter flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-primary">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-13h2v6h-2V7zm0 8h2v2h-2v-2z" />
                </svg>
              </div>
            )}
            <div
              className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-card text-foreground rounded-bl-sm border border-border"
              }`}
            >
              {msg.role === "user" && msg.emotion && (
                <div
                  className="flex items-center gap-1 mb-1.5 text-[10px] font-medium opacity-70"
                >
                  <div
                    className="w-1 h-1 rounded-full"
                    style={{ backgroundColor: EMOTION_COLORS[msg.emotion] }}
                  />
                  {EMOTION_LABELS[msg.emotion]}
                </div>
              )}
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 ml-2.5 mt-0.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-muted-foreground">
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                </svg>
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="message-enter flex justify-start">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-primary">
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-13h2v6h-2V7zm0 8h2v2h-2v-2z" />
              </svg>
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot" />
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot" />
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground typing-dot" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex-none border-t border-border bg-card px-4 py-3">
        {currentEmotion && emotionColor && (
          <div
            className="flex items-center gap-1.5 mb-2 text-[11px] px-2 py-0.5 rounded-md w-fit"
            style={{ backgroundColor: `${emotionColor}15`, color: emotionColor }}
          >
            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: emotionColor }} />
            Responding to your {EMOTION_LABELS[currentEmotion]?.toLowerCase()} state
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Enter to send)"
            rows={1}
            className="flex-1 resize-none rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all min-h-[46px] max-h-[120px] scrollbar-thin"
            style={{ fieldSizing: "content" } as React.CSSProperties}
            disabled={isTyping}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isTyping}
            className="flex-none w-11 h-11 rounded-xl flex items-center justify-center transition-all bg-primary hover:bg-primary/80 text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
