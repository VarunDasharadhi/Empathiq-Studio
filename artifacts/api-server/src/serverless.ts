// Serverless entry for Vercel. Unlike index.ts, this does NOT call app.listen()
// — Vercel invokes the exported Express app directly as a serverless function.
// Env vars (ANTHROPIC_API_KEY, HUME_API_KEY, NODE_ENV) are provided by the
// Vercel project settings, so no dotenv loading is needed here.
import app from "./app";

export default app;
