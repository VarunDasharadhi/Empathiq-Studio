import { useEffect, useRef, useState, useCallback } from "react";
import type { Emotion } from "@/App";

declare global {
  interface Window {
    faceapi: {
      nets: {
        tinyFaceDetector: { loadFromUri: (url: string) => Promise<void>; params: unknown };
        faceExpressionNet: { loadFromUri: (url: string) => Promise<void>; params: unknown };
      };
      TinyFaceDetectorOptions: new () => unknown;
      detectSingleFace: (
        input: HTMLVideoElement,
        options: unknown
      ) => {
        withFaceExpressions: () => Promise<{
          expressions: Record<string, number>;
        } | null>;
      };
    };
  }
}

const MODELS_CDN = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";

const EMOTION_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; ring: string; dot: string }
> = {
  happy: {
    label: "Happy",
    bg: "bg-yellow-400/20",
    text: "text-yellow-300",
    ring: "ring-yellow-400/40",
    dot: "#facc15",
  },
  sad: {
    label: "Sad",
    bg: "bg-blue-500/20",
    text: "text-blue-300",
    ring: "ring-blue-400/40",
    dot: "#60a5fa",
  },
  angry: {
    label: "Angry",
    bg: "bg-red-500/20",
    text: "text-red-300",
    ring: "ring-red-400/40",
    dot: "#f87171",
  },
  fearful: {
    label: "Fearful",
    bg: "bg-purple-500/20",
    text: "text-purple-300",
    ring: "ring-purple-400/40",
    dot: "#c084fc",
  },
  disgusted: {
    label: "Disgusted",
    bg: "bg-green-500/20",
    text: "text-green-300",
    ring: "ring-green-400/40",
    dot: "#4ade80",
  },
  surprised: {
    label: "Surprised",
    bg: "bg-orange-500/20",
    text: "text-orange-300",
    ring: "ring-orange-400/40",
    dot: "#fb923c",
  },
  neutral: {
    label: "Neutral",
    bg: "bg-gray-500/20",
    text: "text-gray-300",
    ring: "ring-gray-400/40",
    dot: "#9ca3af",
  },
};

interface Props {
  onEmotionChange: (emotion: Emotion) => void;
}

type Status = "loading-models" | "requesting-camera" | "ready" | "no-camera" | "error";

export default function WebcamEmotion({ onEmotionChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("loading-models");
  const [detectedEmotion, setDetectedEmotion] = useState<Emotion>(null);
  const [confidence, setConfidence] = useState(0);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const detectionRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getDominantEmotion = (expressions: Record<string, number>): { emotion: Emotion; confidence: number } => {
    const entries = Object.entries(expressions) as Array<[string, number]>;
    const [emotion, conf] = entries.reduce((max, curr) => (curr[1] > max[1] ? curr : max), ["neutral", 0]);
    return {
      emotion: emotion as Emotion,
      confidence: conf,
    };
  };

  const startDetection = useCallback(() => {
    if (detectionRef.current) clearInterval(detectionRef.current);

    detectionRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || !window.faceapi || video.readyState < 2) return;

      try {
        const options = new window.faceapi.TinyFaceDetectorOptions();
        const result = await window.faceapi
          .detectSingleFace(video, options)
          .withFaceExpressions();

        if (result?.expressions) {
          const { emotion, confidence: conf } = getDominantEmotion(result.expressions);
          setDetectedEmotion(emotion);
          setConfidence(conf);
          onEmotionChange(emotion);
        }
      } catch {
        // silently continue
      }
    }, 2500);
  }, [onEmotionChange]);

  const startWebcam = useCallback(async () => {
    setStatus("requesting-camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus("ready");
        startDetection();
      }
    } catch {
      setStatus("no-camera");
    }
  }, [startDetection]);

  useEffect(() => {
    const waitForFaceApi = () => {
      return new Promise<void>((resolve) => {
        const check = () => {
          if (window.faceapi) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    };

    const init = async () => {
      try {
        await waitForFaceApi();
        await Promise.all([
          window.faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_CDN),
          window.faceapi.nets.faceExpressionNet.loadFromUri(MODELS_CDN),
        ]);
        setModelsLoaded(true);
        await startWebcam();
      } catch {
        setStatus("error");
      }
    };

    init();

    return () => {
      if (detectionRef.current) clearInterval(detectionRef.current);
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((t) => t.stop());
      }
    };
  }, [startWebcam]);

  const emotionCfg = detectedEmotion ? EMOTION_CONFIG[detectedEmotion] : null;

  return (
    <div className="relative flex flex-col h-full bg-[#0a0c10]">
      {/* Label */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-md px-2.5 py-1.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-primary">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
        <span className="text-[11px] font-medium text-white/70">Emotion Sensor</span>
      </div>

      {/* Video */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />

        {/* Overlay states */}
        {status !== "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0c10] gap-4">
            {status === "loading-models" && (
              <>
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Loading AI models</p>
                  <p className="text-xs text-muted-foreground mt-1">Downloading emotion detection weights…</p>
                </div>
              </>
            )}
            {status === "requesting-camera" && (
              <>
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
                    <path d="M23 7l-7 5 7 5V7z" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Camera access needed</p>
                  <p className="text-xs text-muted-foreground mt-1">Allow camera permission in your browser</p>
                </div>
              </>
            )}
            {status === "no-camera" && (
              <>
                <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-destructive">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Camera unavailable</p>
                  <p className="text-xs text-muted-foreground mt-1">Enable camera access to detect emotions</p>
                </div>
              </>
            )}
            {status === "error" && (
              <div className="text-center">
                <p className="text-sm font-medium text-destructive">Failed to load models</p>
                <p className="text-xs text-muted-foreground mt-1">Check your connection and refresh</p>
              </div>
            )}
          </div>
        )}

        {/* Scan line when ready + no face */}
        {status === "ready" && !detectedEmotion && (
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-60 scan-line" />
        )}

        {/* Corner brackets overlay */}
        {status === "ready" && (
          <>
            <div className="absolute top-8 left-8 w-8 h-8 border-l-2 border-t-2 border-primary/40 rounded-tl" />
            <div className="absolute top-8 right-8 w-8 h-8 border-r-2 border-t-2 border-primary/40 rounded-tr" />
            <div className="absolute bottom-16 left-8 w-8 h-8 border-l-2 border-b-2 border-primary/40 rounded-bl" />
            <div className="absolute bottom-16 right-8 w-8 h-8 border-r-2 border-b-2 border-primary/40 rounded-br" />
          </>
        )}
      </div>

      {/* Emotion badge strip */}
      <div className="flex-none h-14 flex items-center justify-between px-4 border-t border-border bg-card">
        {emotionCfg && detectedEmotion ? (
          <>
            <div
              className={`emotion-badge flex items-center gap-2 px-3 py-1.5 rounded-full ring-1 ${emotionCfg.bg} ${emotionCfg.text} ${emotionCfg.ring}`}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: emotionCfg.dot, boxShadow: `0 0 6px ${emotionCfg.dot}` }}
              />
              <span className="text-sm font-semibold">{emotionCfg.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Confidence</span>
              <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.round(confidence * 100)}%`,
                    backgroundColor: emotionCfg.dot,
                  }}
                />
              </div>
              <span className="text-xs font-medium tabular-nums" style={{ color: emotionCfg.dot }}>
                {Math.round(confidence * 100)}%
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            {status === "ready" ? (
              <>
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
                <span className="text-xs">Scanning for face…</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                <span className="text-xs">{modelsLoaded ? "Camera starting…" : "Loading…"}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
