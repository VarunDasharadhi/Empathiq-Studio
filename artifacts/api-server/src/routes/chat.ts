import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are EmpathIQ, an emotionally intelligent AI companion. You will always receive the user's current facial emotion as [EMOTION: X] at the start of their message. Respond with empathy calibrated to that emotion. Never mention you can see their face — just naturally reflect their emotional state in your tone. Be warm, wise, and human.`;

router.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
    };

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
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
