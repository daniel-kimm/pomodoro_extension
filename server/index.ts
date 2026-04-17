import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("Missing GEMINI_API_KEY in .env");
}

const ai = new GoogleGenAI({
  apiKey,
});


const classificationCache = new Map<string, { decision: number; ts: number }>();
const TTL_MS = 5 * 60 * 1000; // (5 minutes) If a tab was classified within the last 5 minutes, reuse that decision instead of calling the API again

function makeCacheKey(task: string, tab: any) {
  return `${task}::${tab.domain}::${tab.title}`;
}

app.post("/classify", async (req, res) => {
  try {
    const { task, tab } = req.body;

    if (!task || !tab) {
      return res.status(400).json({ error: "Missing task or tab" });
    }

    const key = makeCacheKey(task, tab);
    const cached = classificationCache.get(key);

    if (cached && Date.now() - cached.ts < TTL_MS) {
      console.log("CACHE HIT:", key);
      return res.json({
        decision: cached.decision,
        raw: "cached"
      });
    }

    const prompt = `
    You are a strict focus-mode classifier for a Pomodoro study blocker.

    You must decide if a browser tab is directly required for completing the user's current study task.

    OUTPUT RULES:
    - Respond with ONLY one character: 0 or 1
    - 0 = ALLOW (directly required for task)
    - 1 = BLOCK (everything else)
    - No explanation, no punctuation, no extra text

    DEFAULT BEHAVIOR:
    - Default is BLOCK (1)
    - Only return 0 if you are highly confident the tab is directly necessary for the task
    - If uncertain, return 1

    ALLOW ONLY if:
    - The tab is essential to complete the task right now
    - It contains direct study material (notes, docs, assignments, references)

    BLOCK if:
    - Social media, entertainment, news, shopping, videos
    - GitHub repos not directly related to solving the task
    - AI chat tools (unless explicitly part of the task)
    - General browsing or discovery pages
    - Anything unrelated or indirectly related

    User task:
    "${task}"

    Tab:
    URL: ${tab.url}
    Domain: ${tab.domain}
    Title: ${tab.title}
    Description: ${tab.description}
  `.trim();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const raw = (response.text || "").trim();
    const decision = raw.trim().startsWith("1") ? 1 : 0;

    classificationCache.set(key, {
      decision,
      ts: Date.now()
    });

    res.json({ decision, raw });
  } catch (error) {
    console.error("Classification failed:", error);
    res.status(500).json({ error: "Classification failed" });
  }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});