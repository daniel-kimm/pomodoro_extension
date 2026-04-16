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

app.post("/classify", async (req, res) => {
  try {
    const { task, tab } = req.body;

    if (!task || !tab) {
      return res.status(400).json({ error: "Missing task or tab" });
    }

    const prompt = `
You are a strict focus-mode assistant. You decide whether a browser tab should be BLOCKED during a student's study session.

Respond with ONLY a single digit: 0 or 1. No explanation, no other text.

0 = allow (tab is DIRECTLY related to the study task)
1 = block (tab is NOT directly related to the study task)

Be strict. Apply these rules:
- Only allow tabs that are DIRECTLY and SPECIFICALLY relevant to the stated task.
- Block social media, entertainment, news, video platforms (Netflix, Twitch, etc.), shopping, and general browsing, unless it is directly related to the stated task.
- Block generic homepages, feeds, and discovery pages even if the site COULD have relevant content.
- Block AI chatbots and general-purpose tools unless the page content is specifically about the task.
- When in doubt, BLOCK. Err on the side of blocking.

User's study task: "${task}"

Tab info:
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
    const decision = raw.includes("1") ? 1 : 0;

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