import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/hume/config", (req, res) => {
  const apiKey = process.env.HUME_API_KEY;
  if (!apiKey) {
    req.log.warn("HUME_API_KEY is not configured");
    res.status(503).json({ error: "Hume API key not configured" });
    return;
  }
  res.json({ apiKey });
});

export default router;
