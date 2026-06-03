// Vercel serverless function entry for the EmpathIQ API.
//
// It re-exports the Express app from the pre-built, fully self-contained
// esbuild bundle (artifacts/api-server/dist/serverless.mjs), which is produced
// by the Vercel `buildCommand`. Using the pre-built bundle keeps Vercel's
// function packaging simple and avoids re-resolving the pnpm workspace.
//
// All `/api/*` requests are routed here by vercel.json; the Express app is
// mounted at `/api`, so it sees the original request path and dispatches
// to the matching route (chat, hume/token, sessions, etc.).
import app from "../artifacts/api-server/dist/serverless.mjs";

export default app;
