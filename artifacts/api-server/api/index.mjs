// Vercel serverless function entry — used when the project's Root Directory is
// set to artifacts/api-server. Mirrors /api/index.mjs at the repo root so the
// API works regardless of which Root Directory the Vercel project uses.
// Re-exports the pre-built, self-contained Express app bundle.
import app from "../dist/serverless.mjs";

export default app;
