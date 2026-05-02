import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WebcamEmotion from "@/components/WebcamEmotion";
import ChatInterface from "@/components/ChatInterface";

const queryClient = new QueryClient();

export type Emotion =
  | "happy"
  | "sad"
  | "angry"
  | "fearful"
  | "disgusted"
  | "surprised"
  | "neutral"
  | null;

function App() {
  const [emotion, setEmotion] = useState<Emotion>(null);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-full w-full bg-background overflow-hidden">
        {/* Header bar */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-3 border-b border-border bg-card/80 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary"
              >
                <path d="M12 2a10 10 0 1 0 10 10" />
                <path d="M12 6v6l4 2" />
                <circle cx="18" cy="6" r="3" fill="currentColor" stroke="none" className="text-primary" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-wide text-foreground">
              EmpathIQ
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-muted-foreground">Live session</span>
          </div>
        </div>

        {/* Split layout */}
        <div className="flex w-full h-full pt-[49px]">
          {/* Left — Webcam */}
          <div className="w-1/2 h-full border-r border-border flex flex-col">
            <WebcamEmotion onEmotionChange={setEmotion} />
          </div>

          {/* Right — Chat */}
          <div className="w-1/2 h-full flex flex-col">
            <ChatInterface currentEmotion={emotion} />
          </div>
        </div>
      </div>
    </QueryClientProvider>
  );
}

export default App;
