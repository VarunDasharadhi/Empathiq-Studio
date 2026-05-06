# EmpathIQ

Multimodal emotional AI app — reads your face, voice, and words to respond with empathy in 11 languages.

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

Required secrets: `ANTHROPIC_API_KEY`, `HUME_API_KEY` (EVI), `SARVAM_API_KEY` (Indian languages)

## Stack

- **Monorepo**: pnpm workspaces, Node 24, TypeScript 5.9
- **Frontend**: React + Vite (`artifacts/empathiq`)
- **API**: Express 5 (`artifacts/api-server`)
- **AI**: Claude (Anthropic) for LLM, Hume EVI for English voice, Sarvam AI for Indian language voice
- **Validation**: Zod (`zod/v4`)

## Where things live

- `artifacts/empathiq/src/` — React app (Chat, Voice, Smart Glasses tabs)
- `artifacts/empathiq/src/components/HumeVoiceMode.tsx` — EVI voice wrapper + Sarvam router
- `artifacts/empathiq/src/components/SarvamVoiceMode.tsx` — Indian language voice component
- `artifacts/empathiq/src/components/ChatInterface.tsx` — Chat tab
- `artifacts/empathiq/src/App.tsx` — LANGUAGES array, LangCode type, tab state
- `artifacts/api-server/src/routes/` — `chat.ts`, `hume.ts`, `sarvam.ts`, `sessions.ts`
- `artifacts/empathiq/public/landing.html` — static investor landing page at `/landing.html`

## Architecture decisions

- **Voice engine routing**: `HumeVoiceMode` checks `INDIAN_LANG_CODES = {HI,TA,TE,KN,ML,BN}` and renders `SarvamVoiceMode` instead of EVI. All hooks run unconditionally; Sarvam early-return is placed after all hooks.
- **Sarvam STT**: Browser records audio as `application/octet-stream` → `/api/sarvam/stt?lang=hi-IN` → backend wraps in FormData and forwards to `https://api.sarvam.ai/speech-to-text` (model: `saaras:v3`).
- **Sarvam TTS**: `/api/sarvam/tts` calls `https://api.sarvam.ai/text-to-speech` (model: `bulbul:v3`), returns base64 WAV; browser plays via `new Audio("data:audio/wav;base64,...")`.
- **Voice gender**: `feminine → ritu`, `masculine → aditya` (bulbul:v3 voices).
- **LLM unchanged**: Claude handles all responses regardless of voice engine; language injected into system prompt.

## Product

- **Chat tab**: Text + speech-to-text, face emotion overlay, 9 mood modes, Roast Mode
- **Voice tab**: EVI (English) or Sarvam AI (Hindi/Tamil/Telugu/Kannada/Malayalam/Bengali), gender toggle, "Powered by Sarvam AI" badge, same 9 modes
- **Smart Glasses tab**: Minimal heads-up display for wearables
- **11 languages**: EN, HI, TA, TE, KN, ML, BN, AR (RTL), FR, ES, DE

## User preferences

- Keep voice UIs visually consistent between EVI and Sarvam modes
- "Powered by Sarvam AI" badge shown in Indian language voice mode

## Gotchas

- React hooks must all be called unconditionally in `HumeVoiceMode` — Sarvam early-return goes after `useEffect`/`useCallback`.
- Sarvam TTS truncates at 500 chars per request (enforced in backend).
- `express.raw()` middleware is applied per-route for the STT endpoint (global `express.json()` only parses `application/json`).
