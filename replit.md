# EmpathIQ

Multimodal emotional AI app — reads your face, voice, and words to respond with empathy in 8 languages.

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

Required secrets: `ANTHROPIC_API_KEY`, `HUME_API_KEY` (EVI 3)

## Deploy (Vercel)

Deployed as a single full-stack Vercel project: static Vite frontend + the Express API as a serverless function. Config lives in `vercel.json` (repo root).

- **Build** (`vercel.json#buildCommand`): builds libs, bundles the API (`artifacts/api-server/dist/serverless.mjs`, an esbuild bundle that exports the Express app without `app.listen()`), builds the Vite frontend, and copies it to `public/`.
- **Function**: `api/index.mjs` re-exports the built Express app; `vercel.json` rewrites `/api/*` to it and `/app` → `/app.html`.
- **Required Vercel project settings**: Root Directory = repo root, Framework Preset = `Other`, env vars `ANTHROPIC_API_KEY` + `HUME_API_KEY`. Project: `empathiq-studio` (team-viper). Prod URL: `https://empathiq-studio-api-server.vercel.app` (app at `/app`).
- Push to `main` → production deploy via GitHub integration.
- **Caveat**: `artifacts/api-server/src/routes/sessions.ts` uses in-memory storage, so session history is ephemeral across serverless cold starts (the Neon `DATABASE_URL` is currently unused).

## Stack

- **Monorepo**: pnpm workspaces, Node 24, TypeScript 5.9
- **Frontend**: React + Vite (`artifacts/empathiq`)
- **API**: Express 5 (`artifacts/api-server`)
- **AI**: Claude (Anthropic) for LLM, Hume EVI 3 for voice
- **Validation**: Zod (`zod/v4`)

## Where things live

- `artifacts/empathiq/src/` — React app (Chat, Voice, Smart Glasses tabs)
- `artifacts/empathiq/src/components/HumeVoiceMode.tsx` — EVI 3 voice wrapper
- `artifacts/empathiq/src/components/ChatInterface.tsx` — Chat tab
- `artifacts/empathiq/src/App.tsx` — LANGUAGES array, LangCode type, tab state
- `artifacts/api-server/src/routes/` — `chat.ts`, `hume.ts`, `sessions.ts`
- `artifacts/empathiq/public/landing.html` — static investor landing page at `/landing.html`

## Architecture decisions

- **Voice engine**: Hume EVI 3 for all languages. Language is injected into the system prompt as "Respond only in {lang}. Speak naturally as a native speaker would." — EVI 3 has no direct language parameter.
- **Language list**: 8 EVI 3-supported languages (EN-GB, EN-US, ES, FR, DE, PT, JA, KO). Indian languages removed; a "coming soon" non-selectable note is shown at the bottom of the language dropdown.
- **Mode order**: Roast Mode sits immediately after Companion in the mode bar (both Chat and Voice tabs).
- **LLM**: Claude handles all chat responses; language injected into system prompt.

## Product

- **Chat tab**: Text + speech-to-text, face emotion overlay, 9 mood modes (Companion first, Roast Mode second)
- **Voice tab**: Hume EVI 3, gender toggle, "Voice language powered by Hume EVI 3" note, same 9 modes
- **Smart Glasses tab**: Minimal heads-up display for wearables
- **8 languages**: EN-GB, EN-US, ES, FR, DE, PT, JA, KO (Indian languages coming soon)

## User preferences

- Roast Mode appears immediately after Companion in all mode selectors
- "Indian languages coming soon" shown as disabled muted option at bottom of language dropdown

## Gotchas

- EVI 3 language is set via system prompt only — no direct language parameter in the SDK.
- Language dropdown "coming soon" entry is a `<div>` (not a `<button>`) so it is non-selectable by design.
