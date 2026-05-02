import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BASE_SUFFIX = `\n\nYou will always receive the user's current facial emotion as [EMOTION: X] at the start of their message. Calibrate your response tone to that emotion naturally — never mention that you can see their face.`;

const DEFAULT_SYSTEM_PROMPT = `You are EmpathIQ, an emotionally intelligent AI companion. Be warm, wise, and human.${BASE_SUFFIX}`;

router.post("/chat", async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      systemPrompt?: string;
    };

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    const system = systemPrompt
      ? `${systemPrompt}${BASE_SUFFIX}`
      : DEFAULT_SYSTEM_PROMPT;

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system,
      messages,
    });

    const content = response.content[0];
    if (content.type !== "text") {
      res.status(500).json({ error: "Unexpected response type from Claude" });
      return;
    }

    res.json({ content: content.text });
  } catch (err) {
    req.log.error({ err }, "Chat route error");
    res.status(500).json({ error: "Failed to get response from Claude" });
  }
});

export default router;
