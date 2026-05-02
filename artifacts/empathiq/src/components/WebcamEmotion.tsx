import { useEffect, useRef, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
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

const EMOTION_CONFIG: Record<string, { label: string; bg: string; text: string; ring: string; dot: string }> = {
  happy:     { label: "Happy",     bg: "bg-yellow-400/20", text: "text-yellow-300",  ring: "ring-yellow-400/40",  dot: "#facc15" },
  sad:       { label: "Sad",       bg: "bg-blue-500/20",   text: "text-blue-300",    ring: "ring-blue-400/40",    dot: "#60a5fa" },
  angry:     { label: "Angry",     bg: "bg-red-500/20",    text: "text-red-300",     ring: "ring-red-400/40",     dot: "#f87171" },
  fearful:   { label: "Fearful",   bg: "bg-purple-500/20", text: "text-purple-300",  ring: "ring-purple-400/40",  dot: "#c084fc" },
  disgusted: { label: "Disgusted", bg: "bg-green-500/20",  text: "text-green-300",   ring: "ring-green-400/40",   dot: "#4ade80" },
  surprised: { label: "Surprised", bg: "bg-orange-500/20", text: "text-orange-300",  ring: "ring-orange-400/40",  dot: "#fb923c" },
  neutral:   { label: "Neutral",   bg: "bg-gray-500/20",   text: "text-gray-300",    ring: "ring-gray-400/40",    dot: "#9ca3af" },
};

const EMOTION_VALUE: Record<string, number> = {
  happy: 7, surprised: 6, neutral: 5,
  fearful: 4, sad: 3, disgusted: 2, angry: 1,
};

const VALUE_LABEL: Record<number, string> = {
  7: "Happy", 6: "Surp.", 5: "Neut.",
  4: "Fear.", 3: "Sad", 2: "Disg.", 1: "Angry",
};

interface TimelinePoint { t: number; value: number; emotion: string; }
const NEGATIVE_EMOTIONS = new Set(["sad", "angry", "fearful", "disgusted"]);
const SUSTAINED_THRESHOLD = 24; // ~60s at 2500ms interval

interface Props {
  onEmotionChange: (emotion: Emotion) => void;
  onSustainedNegative?: (emotion: string, durationSeconds: number) => void;
  sessionId: number | null;
  voiceEmotion?: string | null;
  voiceEmotionScores?: Record<string, number> | null;
  glassesMode?: boolean;
  activateGlasses?: boolean;
  onCoachingText?: (text: string) => void;
}
type Status = "loading-models" | "requesting-camera" | "ready" | "off" | "no-camera" | "error";

const VOICE_EMOTION_COLORS: Record<string, string> = {
  happy: "#facc15", sad: "#60a5fa", angry: "#f87171", fearful: "#c084fc",
  disgusted: "#4ade80", surprised: "#fb923c", neutral: "#9ca3af",
  joy: "#facc15", anxiety: "#c084fc", distress: "#60a5fa", pain: "#f87171",
  calmness: "#4ade80", amusement: "#facc15", awe: "#67e8f9", confusion: "#9ca3af",
  contempt: "#f87171", excited: "#fb923c",
};

const EMOTION_VALENCE: Record<string, "positive" | "negative" | "neutral"> = {
  happy: "positive", surprised: "positive", joy: "positive", excited: "positive",
  amusement: "positive", awe: "positive",
  neutral: "neutral", calmness: "neutral", confusion: "neutral",
  sad: "negative", angry: "negative", fearful: "negative", disgusted: "negative",
  anxiety: "negative", distress: "negative", pain: "negative", contempt: "negative",
};

function getOverallLabel(face: string | null, voice: string | null): { label: string; color: string } {
  if (!face && !voice) return { label: "No data", color: "#9ca3af" };
  if (!voice) return { label: face!, color: EMOTION_CONFIG[face!]?.dot ?? "#9ca3af" };
  if (!face) return { label: voice, color: VOICE_EMOTION_COLORS[voice.toLowerCase()] ?? "#9ca3af" };
  if (face === voice) return { label: face, color: EMOTION_CONFIG[face]?.dot ?? "#9ca3af" };
  const fv = EMOTION_VALENCE[face] ?? "neutral";
  const vv = EMOTION_VALENCE[voice.toLowerCase()] ?? "neutral";
  if (fv === "neutral") return { label: voice, color: VOICE_EMOTION_COLORS[voice.toLowerCase()] ?? "#9ca3af" };
  if (vv === "neutral") return { label: face, color: EMOTION_CONFIG[face]?.dot ?? "#9ca3af" };
  if (fv === vv) return { label: `${face} / ${voice}`, color: EMOTION_CONFIG[face]?.dot ?? "#9ca3af" };
  return { label: "Mixed", color: "#fb923c" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomYTick = ({ x, y, payload }: any) => {
  const label = VALUE_LABEL[payload.value as number];
  if (!label) return null;
  return (
    <text x={x - 2} y={y} textAnchor="end" dominantBaseline="middle" fill="#6b7280" fontSize={9}>
      {label}
    </text>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as TimelinePoint;
  const cfg = EMOTION_CONFIG[point.emotion];
  if (!cfg) return null;
  return (
    <div className="bg-[#1a1d24] border border-border rounded px-2 py-1 text-[10px]" style={{ color: cfg.dot }}>
      {cfg.label}
    </div>
  );
};

export default function WebcamEmotion({ onEmotionChange, onSustainedNegative, sessionId, voiceEmotion = null, voiceEmotionScores = null, glassesMode = false, activateGlasses = false, onCoachingText }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("loading-models");
  const [detectedEmotion, setDetectedEmotion] = useState<Emotion>(null);
  const [confidence, setConfidence] = useState(0);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [aiReading, setAiReading] = useState<string | null>(null);
  const [readingKey, setReadingKey] = useState(0);
  const [readingLoading, setReadingLoading] = useState(false);
  const [glassesViewActive, setGlassesViewActive] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeCameraIdx, setActiveCameraIdx] = useState(0);
  const [coachingText, setCoachingText] = useState<string | null>(null);
  const [coachingKey, setCoachingKey] = useState(0);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const detectionRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef(0);
  const emotionRef = useRef<Emotion>(null);
  const confidenceRef = useRef(0);
  const voiceEmotionRef = useRef<string | null>(null);
  const voiceScoresRef = useRef<Record<string, number> | null>(null);
  const negativeStreakRef = useRef(0);
  const sustainedEmotionRef = useRef<string | null>(null);
  const onSustainedNegativeRef = useRef(onSustainedNegative);
  const onCoachingTextRef = useRef(onCoachingText);
  const glassesActiveRef = useRef(false);
  const coachingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toggleGlassesViewRef = useRef<() => Promise<void>>(() => Promise.resolve());
  useEffect(() => { onSustainedNegativeRef.current = onSustainedNegative; }, [onSustainedNegative]);
  useEffect(() => { onCoachingTextRef.current = onCoachingText; }, [onCoachingText]);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { voiceEmotionRef.current = voiceEmotion; }, [voiceEmotion]);
  useEffect(() => { voiceScoresRef.current = voiceEmotionScores; }, [voiceEmotionScores]);

  const fetchAiReading = useCallback(async () => {
    const face = emotionRef.current;
    const voice = voiceEmotionRef.current;
    if (!face && !voice) return;
    setReadingLoading(true);
    try {
      const res = await fetch("/api/emotion-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faceEmotion: face,
          faceConfidence: confidenceRef.current,
          voiceEmotion: voice,
          voiceEmotionScores: voiceScoresRef.current,
        }),
      });
      const data = await res.json() as { reading: string | null };
      if (data.reading) {
        setAiReading(data.reading);
        setReadingKey((k) => k + 1);
      }
    } catch { /* non-critical */ } finally {
      setReadingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (readingRef.current) clearInterval(readingRef.current);
    readingRef.current = setInterval(fetchAiReading, 10000);
    return () => { if (readingRef.current) clearInterval(readingRef.current); };
  }, [fetchAiReading]);

  const getDominantEmotion = (expressions: Record<string, number>): { emotion: Emotion; confidence: number } => {
    const entries = Object.entries(expressions) as Array<[string, number]>;
    const [emotion, conf] = entries.reduce((max, curr) => (curr[1] > max[1] ? curr : max), ["neutral", 0]);
    return { emotion: emotion as Emotion, confidence: conf };
  };

  const recordEmotionSnapshot = async (emotion: string, conf: number) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await fetch(`/api/sessions/${sid}/emotions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emotion, confidence: conf }),
      });
    } catch { /* non-critical */ }
  };

  const stopCamera = useCallback(() => {
    if (detectionRef.current) { clearInterval(detectionRef.current); detectionRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setDetectedEmotion(null);
    setConfidence(0);
    onEmotionChange(null);
  }, [onEmotionChange]);

  const startDetection = useCallback(() => {
    if (detectionRef.current) clearInterval(detectionRef.current);
    detectionRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || !window.faceapi || video.readyState < 2) return;
      try {
        const result = await window.faceapi
          .detectSingleFace(video, new window.faceapi.TinyFaceDetectorOptions())
          .withFaceExpressions();
        if (result?.expressions) {
          const { emotion, confidence: conf } = getDominantEmotion(result.expressions);
          setDetectedEmotion(emotion);
          setConfidence(conf);
          emotionRef.current = emotion;
          confidenceRef.current = conf;
          onEmotionChange(emotion);
          recordEmotionSnapshot(emotion as string, conf);
          // Sustained negative emotion tracking
          if (emotion && NEGATIVE_EMOTIONS.has(emotion as string)) {
            negativeStreakRef.current += 1;
            sustainedEmotionRef.current = emotion as string;
            if (negativeStreakRef.current === SUSTAINED_THRESHOLD) {
              const seconds = Math.round(SUSTAINED_THRESHOLD * 2.5);
              onSustainedNegativeRef.current?.(emotion as string, seconds);
              negativeStreakRef.current = 0; // reset so it won't fire again immediately
            }
          } else {
            negativeStreakRef.current = 0;
            sustainedEmotionRef.current = null;
          }
          const value = EMOTION_VALUE[emotion as string] ?? 5;
          const t = tickRef.current++;
          setTimeline((prev) => {
            const next = [...prev, { t, value, emotion: emotion as string }];
            return next.length > 20 ? next.slice(next.length - 20) : next;
          });
        }
      } catch { /* silently continue */ }
    }, 2500);
  }, [onEmotionChange]);

  const startCamera = useCallback(async (deviceId?: string) => {
    setStatus("requesting-camera");
    try {
      const videoConstraints: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } };
      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      // Enumerate cameras after permission granted (labels only available after getUserMedia)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      setAvailableCameras(cams);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus("ready");
        startDetection();
      }
    } catch { setStatus("no-camera"); }
  }, [startDetection]);

  const switchCamera = useCallback(async (deviceId: string | undefined, newIdx: number) => {
    if (detectionRef.current) { clearInterval(detectionRef.current); detectionRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    setActiveCameraIdx(newIdx);
    await startCamera(deviceId);
  }, [startCamera]);

  const fetchCoaching = useCallback(async () => {
    const emotion = emotionRef.current;
    const conf = confidenceRef.current;
    if (!emotion || !glassesActiveRef.current) return;
    setCoachingLoading(true);
    try {
      const res = await fetch("/api/glasses-coaching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emotion, confidence: conf }),
      });
      const data = await res.json() as { coaching: string | null };
      if (data.coaching && glassesActiveRef.current) {
        setCoachingText(data.coaching);
        setCoachingKey((k) => k + 1);
        onCoachingTextRef.current?.(data.coaching);
      }
    } catch { /* non-critical */ } finally {
      setCoachingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (glassesViewActive) {
      fetchCoaching();
      coachingIntervalRef.current = setInterval(fetchCoaching, 6000);
    } else {
      if (coachingIntervalRef.current) { clearInterval(coachingIntervalRef.current); coachingIntervalRef.current = null; }
    }
    return () => { if (coachingIntervalRef.current) { clearInterval(coachingIntervalRef.current); coachingIntervalRef.current = null; } };
  }, [glassesViewActive, fetchCoaching]);

  const toggleGlassesView = useCallback(async () => {
    if (glassesActiveRef.current) {
      glassesActiveRef.current = false;
      setGlassesViewActive(false);
      setCoachingText(null);
      // Switch back to first camera (face-inward)
      await switchCamera(availableCameras[0]?.deviceId, 0);
    } else {
      glassesActiveRef.current = true;
      setGlassesViewActive(true);
      setCoachingText(null);
      // Switch to second camera if available, else stay on same (just flip/HUD changes)
      const targetIdx = availableCameras.length > 1 ? 1 : 0;
      await switchCamera(availableCameras[targetIdx]?.deviceId, targetIdx);
    }
  }, [availableCameras, switchCamera]);

  // Keep ref in sync so auto-activation effects don't capture stale closure
  useEffect(() => { toggleGlassesViewRef.current = toggleGlassesView; }, [toggleGlassesView]);

  // Auto-activate glasses view when the Smart Glasses tab becomes active
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activateGlasses && !glassesActiveRef.current && status === "ready") {
      void toggleGlassesViewRef.current();
    } else if (!activateGlasses && glassesActiveRef.current) {
      void toggleGlassesViewRef.current();
    }
  }, [activateGlasses]); // intentionally omit status — handled by the effect below

  // Also trigger when camera becomes ready while activateGlasses is already true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activateGlasses && status === "ready" && !glassesActiveRef.current) {
      void toggleGlassesViewRef.current();
    }
  }, [status]); // intentionally omit activateGlasses — handled by effect above

  const cycleCamera = useCallback(async () => {
    if (availableCameras.length < 2) return;
    const nextIdx = (activeCameraIdx + 1) % availableCameras.length;
    await switchCamera(availableCameras[nextIdx]?.deviceId, nextIdx);
  }, [availableCameras, activeCameraIdx, switchCamera]);

  const toggleCamera = useCallback(async () => {
    if (status === "ready") { stopCamera(); setStatus("off"); }
    else if (status === "off" || status === "no-camera") { await startCamera(); }
  }, [status, stopCamera, startCamera]);

  useEffect(() => {
    const waitForFaceApi = () => new Promise<void>((resolve) => {
      const check = () => (window.faceapi ? resolve() : setTimeout(check, 100));
      check();
    });
    const init = async () => {
      try {
        await waitForFaceApi();
        await Promise.all([
          window.faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_CDN),
          window.faceapi.nets.faceExpressionNet.loadFromUri(MODELS_CDN),
        ]);
        setModelsLoaded(true);
        await startCamera();
      } catch { setStatus("error"); }
    };
    init();
    return () => {
      if (detectionRef.current) clearInterval(detectionRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  const emotionCfg = detectedEmotion ? EMOTION_CONFIG[detectedEmotion] : null;
  const lineColor = emotionCfg?.dot ?? "#6b7280";
  const canToggle = status === "ready" || status === "off" || status === "no-camera";

  return (
    <div className="relative flex flex-col h-full bg-[#0a0c10]">
      {/* Top bar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between">
        <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-md px-2.5 py-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-primary">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
          <span className="text-[11px] font-medium text-white/70">Emotion Sensor</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Glasses View toggle — only in Smart Glasses mode */}
          {glassesMode && status === "ready" && (
            <button
              onClick={toggleGlassesView}
              title={glassesViewActive ? "Back to face view" : "Switch to Glasses View — read their emotions"}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md backdrop-blur-sm text-[11px] font-medium transition-all ${
                glassesViewActive
                  ? "bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-400/50"
                  : "bg-black/50 text-white/60 hover:bg-emerald-500/20 hover:text-emerald-300"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5" cy="12" r="3" /><circle cx="19" cy="12" r="3" />
                <path d="M8 12h8M2 12h0M22 12h0" />
              </svg>
              {glassesViewActive ? "Face View" : "Glasses View"}
            </button>
          )}

          {/* Camera cycle — only when glasses active and multiple cameras */}
          {glassesViewActive && availableCameras.length > 1 && (
            <button
              onClick={cycleCamera}
              title="Switch camera"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/50 backdrop-blur-sm text-[11px] font-medium text-white/60 hover:bg-white/10 hover:text-white transition-all"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15" />
              </svg>
              Flip
            </button>
          )}

          {/* Privacy mode toggle — only when camera is running */}
          {status === "ready" && !glassesViewActive && (
            <button
              onClick={() => setPrivacyMode((p) => !p)}
              title={privacyMode ? "Disable privacy mode" : "Enable privacy mode"}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md backdrop-blur-sm text-[11px] font-medium transition-all ${
                privacyMode
                  ? "bg-violet-500/30 text-violet-300 ring-1 ring-violet-400/50"
                  : "bg-black/50 text-white/60 hover:bg-violet-500/20 hover:text-violet-300"
              }`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Privacy
            </button>
          )}

          {/* Camera on/off */}
          {canToggle && (
            <button
              onClick={toggleCamera}
              title={status === "ready" ? "Turn camera off" : "Turn camera on"}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md backdrop-blur-sm text-[11px] font-medium transition-all ${
                status === "ready"
                  ? "bg-black/50 text-white/70 hover:bg-red-500/30 hover:text-red-300"
                  : "bg-black/50 text-white/50 hover:bg-primary/20 hover:text-primary"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              {status === "ready" ? "Off" : "On"}
            </button>
          )}
        </div>
      </div>

      {/* Video */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover transition-all duration-500"
          style={{
            transform: glassesViewActive ? "none" : "scaleX(-1)",
            filter: privacyMode ? "blur(22px) brightness(0.6)" : "none",
          }}
        />

        {/* Privacy mode overlay badge */}
        {privacyMode && status === "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-2 bg-black/40 backdrop-blur-sm rounded-2xl px-5 py-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-violet-300">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <p className="text-xs font-medium text-violet-200">Privacy mode on</p>
              <p className="text-[10px] text-white/40">Emotion detection still active</p>
            </div>
          </div>
        )}

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
                    <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Camera access needed</p>
                  <p className="text-xs text-muted-foreground mt-1">Allow camera permission in your browser</p>
                </div>
              </>
            )}
            {status === "off" && (
              <>
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-muted-foreground">
                    <path d="M23 7l-7 5 7 5V7z" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Camera is off</p>
                  <p className="text-xs text-muted-foreground mt-1">Click "On" to resume emotion detection</p>
                </div>
                <button
                  onClick={toggleCamera}
                  className="mt-1 px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                >
                  Turn camera on
                </button>
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

        {status === "ready" && !detectedEmotion && !privacyMode && (
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-60 scan-line" />
        )}

        {status === "ready" && !privacyMode && (
          <>
            <div className="absolute top-10 left-8 w-8 h-8 border-l-2 border-t-2 border-primary/40 rounded-tl" />
            <div className="absolute top-10 right-8 w-8 h-8 border-r-2 border-t-2 border-primary/40 rounded-tr" />
            <div className="absolute bottom-4 left-8 w-8 h-8 border-l-2 border-b-2 border-primary/40 rounded-bl" />
            <div className="absolute bottom-4 right-8 w-8 h-8 border-r-2 border-b-2 border-primary/40 rounded-br" />
          </>
        )}

        {/* Glasses View active badge */}
        {glassesViewActive && status === "ready" && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
            <div className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-400/30 backdrop-blur-sm rounded-full px-3 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-300 font-medium tracking-wide">Glasses View — Reading them</span>
            </div>
          </div>
        )}

        {/* HUD teleprompter overlay */}
        {glassesViewActive && status === "ready" && (
          <div
            className="absolute inset-x-0 bottom-0 z-20 pointer-events-none"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.45) 55%, transparent 100%)", paddingBottom: 10, paddingTop: 28 }}
          >
            <div className="px-4 pb-1 min-h-[36px] flex items-end">
              {coachingLoading && !coachingText && (
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] text-emerald-400/60 font-mono italic">Reading…</span>
                </div>
              )}
              {coachingText && (
                <div
                  key={coachingKey}
                  className="flex items-start gap-2.5 w-full"
                  style={{ animation: "eiFadeIn 0.5s ease-out forwards" }}
                >
                  <div className="flex-none w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1 animate-pulse" />
                  <p className="text-[13px] leading-snug font-medium text-emerald-200 drop-shadow-lg flex-1">{coachingText}</p>
                  {coachingLoading && (
                    <div className="flex-none w-2.5 h-2.5 rounded-full border border-emerald-400/40 border-t-emerald-400 animate-spin mt-0.5" />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Emotional Intelligence Panel ── */}
      <div className="flex-none border-t border-white/6 bg-[#0a0c10] px-4 py-3 flex flex-col gap-2.5">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/40 mb-0.5">Emotional Intelligence</p>

        {/* Row 1 — Face */}
        <div className="flex items-center gap-2">
          <span className="text-sm leading-none w-5 text-center flex-none">👁️</span>
          <span className="text-[10px] text-muted-foreground/50 w-10 flex-none">{glassesViewActive ? "Their" : "Face"}</span>
          {emotionCfg && detectedEmotion ? (
            <>
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${emotionCfg.bg} ${emotionCfg.text} ${emotionCfg.ring}`}>
                <div className="w-1.5 h-1.5 rounded-full flex-none" style={{ backgroundColor: emotionCfg.dot }} />
                {emotionCfg.label}
              </div>
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round(confidence * 100)}%`, backgroundColor: emotionCfg.dot, boxShadow: `0 0 6px ${emotionCfg.dot}60` }} />
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground/50 w-7 text-right flex-none">{Math.round(confidence * 100)}%</span>
            </>
          ) : (
            <span className="text-[10px] text-muted-foreground/30 italic">
              {status === "ready" ? "Scanning…" : status === "off" ? "Camera off" : modelsLoaded ? "Starting…" : "Loading…"}
            </span>
          )}
        </div>

        {/* Row 2 — Voice */}
        <div className="flex items-center gap-2">
          <span className="text-sm leading-none w-5 text-center flex-none">🎙️</span>
          <span className="text-[10px] text-muted-foreground/50 w-10 flex-none">Voice</span>
          {voiceEmotion ? (() => {
            const vColor = VOICE_EMOTION_COLORS[voiceEmotion.toLowerCase()] ?? "#9ca3af";
            const topScore = voiceEmotionScores ? Math.max(...Object.values(voiceEmotionScores)) : 0;
            return (
              <>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ backgroundColor: `${vColor}18`, color: vColor, boxShadow: `0 0 0 1px ${vColor}35` }}>
                  <div className="w-1.5 h-1.5 rounded-full flex-none" style={{ backgroundColor: vColor }} />
                  <span className="capitalize">{voiceEmotion}</span>
                </div>
                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round(topScore * 100)}%`, backgroundColor: vColor, boxShadow: `0 0 6px ${vColor}60` }} />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground/50 w-7 text-right flex-none">{Math.round(topScore * 100)}%</span>
              </>
            );
          })() : (
            <span className="text-[10px] text-muted-foreground/30 italic">Not active</span>
          )}
        </div>

      </div>

      {/* Bottom chart: voice prosody bars when voice active, else face timeline */}
      <div className="flex-none border-t border-border bg-[#0d0f14]" style={{ height: 80 }}>
        {voiceEmotion && voiceEmotionScores && Object.keys(voiceEmotionScores).length > 0 ? (
          // Voice prosody bar chart — top 8 emotions
          <div className="flex items-end gap-1 h-full px-3 py-2">
            {Object.entries(voiceEmotionScores)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([name, score]) => {
                const color = VOICE_EMOTION_COLORS[name.toLowerCase()] ?? "#6b7280";
                const heightPct = Math.max(4, Math.round(score * 100));
                return (
                  <div key={name} className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
                    <div
                      className="w-full rounded-t-sm transition-all duration-500"
                      style={{ height: `${heightPct}%`, backgroundColor: color, opacity: 0.8, boxShadow: `0 0 4px ${color}50` }}
                    />
                    <span
                      className="text-[7px] text-center leading-none truncate w-full"
                      style={{ color }}
                    >
                      {name.slice(0, 5)}
                    </span>
                  </div>
                );
              })}
          </div>
        ) : timeline.length >= 2 ? (
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={timeline} margin={{ top: 10, right: 12, left: 36, bottom: 6 }}>
              <YAxis
                domain={[1, 7]}
                ticks={[1, 2, 3, 4, 5, 6, 7]}
                tick={<CustomYTick />}
                width={36}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: lineColor, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-[10px] text-muted-foreground/50">Emotion timeline will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
}
