import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

// Lazy singleton — env vars must be loaded before first request
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

// Voice options: ITO = masculine, KORA = feminine
// v2 suffix forces config recreation with updated eou_sensitivity setting
const VOICE_OPTIONS = {
  masculine: { name: "ITO",  configKey: "EmpathIQ-ITO-v2" },
  feminine:  { name: "KORA", configKey: "EmpathIQ-KORA-v2" },
} as const;
type VoiceGender = keyof typeof VOICE_OPTIONS;

// Cache one configId per voice so we don't recreate configs on every request
const cachedConfigIds: Partial<Record<VoiceGender, string>> = {};

const SYSTEM_PROMPT =
  "You are EmpathIQ, an emotionally intelligent AI voice companion. " +
  "Be warm, concise, and human. Keep responses to 1-3 sentences — this is a voice conversation.";

async function getOrCreateEviConfig(
  apiKey: string,
  gender: VoiceGender,
): Promise<string | null> {
  if (cachedConfigIds[gender]) return cachedConfigIds[gender]!;

  const { name: voiceName, configKey } = VOICE_OPTIONS[gender];

  try {
    // Reuse existing config for this voice if one exists
    const listRes = await fetch("https://api.hume.ai/v0/evi/configs?page_size=50", {
      headers: { "X-Hume-Api-Key": apiKey },
    });
    if (listRes.ok) {
      const listData = await listRes.json() as { configs_page?: Array<{ id: string; name: string }> };
      const existing = listData.configs_page?.find((c) => c.name === configKey);
      if (existing) {
        cachedConfigIds[gender] = existing.id;
        return existing.id;
      }
    }

    // Create new config using Hume's native Anthropic integration (no custom proxy needed)
    const createRes = await fetch("https://api.hume.ai/v0/evi/configs", {
      method: "POST",
      headers: { "X-Hume-Api-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: configKey,
        language_model: { model_provider: "ANTHROPIC", model_resource: "claude-sonnet-4-20250514" },
        voice: { provider: "HUME_AI", name: voiceName },
        system_prompt: SYSTEM_PROMPT,
        // Wait 3 s of silence before EVI thinks the user is done speaking
        eou_sensitivity: "LOW",
        timeouts: {
          inactivity: { enabled: true, duration_secs: 30 },
          max_duration: { enabled: true, duration_secs: 1800 },
        },
      }),
    });
    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Hume config create failed (${createRes.status}): ${errText}`);
    }
    const created = await createRes.json() as { id?: string };
    if (created.id) {
      cachedConfigIds[gender] = created.id;
      return created.id;
    }
    return null;
  } catch (err) {
    // Log but don't crash — caller will return null configId
    console.error("getOrCreateEviConfig error:", err);
    return null;
  }
}

// GET /api/hume/token?voice=masculine|feminine
// Returns API key + EVI configId for the requested voice gender
router.get("/hume/token", async (req, res) => {
  const apiKey = process.env.HUME_API_KEY;
  if (!apiKey) {
    req.log.warn("HUME_API_KEY is not configured");
    res.status(500).json({ error: "HUME_API_KEY not configured" });
    return;
  }

  const rawVoice = (req.query.voice as string | undefined) ?? "feminine";
  const gender: VoiceGender = rawVoice === "masculine" ? "masculine" : "feminine";

  const configId = await getOrCreateEviConfig(apiKey, gender);

  res.json({ apiKey, configId, voice: gender });
});

// POST /api/evi/chat — kept as a fallback External LLM endpoint
// Not used by the default EVI configs (which use Hume's native Anthropic integration),
// but available for custom prompt overrides in the future.
router.post("/evi/chat", async (req, res) => {
  try {
    const body = req.body as {
      messages?: Array<{ role: string; content: string }>;
      system?: string;
      max_tokens?: number;
    };

    const messages = (body.messages ?? []).filter(
      (m) => m.role === "user" || m.role === "assistant"
    ) as Array<{ role: "user" | "assistant"; content: string }>;

    const systemPrompt = body.system ?? SYSTEM_PROMPT;

    const response = await getAnthropic().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: body.max_tokens ?? 200,
      system: systemPrompt,
      messages,
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";

    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      model: "claude-haiku-4-5",
      choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    });
  } catch (err) {
    req.log.error({ err }, "EVI external LLM error");
    res.status(500).json({ error: { message: "Internal server error", type: "server_error" } });
  }
});

export default router;
