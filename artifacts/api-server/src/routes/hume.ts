import { Router, type IRouter } from "express";

const router: IRouter = Router();

async function humeGet(path: string, apiKey: string) {
  const res = await fetch(`https://api.hume.ai/v0/evi${path}`, {
    headers: { "X-Hume-Api-Key": apiKey },
  });
  if (!res.ok) return null;
  return res.json() as Promise<unknown>;
}

router.get("/hume/config", async (req, res) => {
  const apiKey = process.env.HUME_API_KEY;
  if (!apiKey) {
    req.log.warn("HUME_API_KEY is not configured");
    res.status(503).json({ error: "Hume API key not configured" });
    return;
  }

  try {
    const [configsData, voicesData] = await Promise.all([
      humeGet("/configs?page_size=20", apiKey),
      humeGet("/custom-voices?page_size=50", apiKey),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const configs = ((configsData as any)?.configs_page ?? []).map((c: any) => ({
      id: c.id as string,
      version: c.version as number,
      name: (c.name as string) ?? "Unnamed config",
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const voices = ((voicesData as any)?.custom_voices_page ?? []).map((v: any) => ({
      id: v.id as string,
      name: (v.name as string) ?? "Unnamed voice",
    }));

    res.json({ apiKey, configs, voices });
  } catch (err) {
    req.log.error({ err }, "Hume config fetch error");
    // Still return apiKey even if listing fails
    res.json({ apiKey, configs: [], voices: [] });
  }
});

export default router;
