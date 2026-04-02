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
You are deciding whether a browser tab should be blocked during a focused study session.

Return:
0 = allow tab
1 = block tab

Rules:
- Return 0 if the tab is relevant or plausibly useful for the user's task.
- Return 1 if the tab is irrelevant, distracting, or not helpful for the user's task.
- If uncertain but plausibly useful, return 0.
- Output shoudl be exactly one character: 0 or 1.

User task:
${task}

Tab metadata:
URL: ${tab.url}
Domain: ${tab.domain}
Title: ${tab.title}
Description: ${tab.description}
Text snippet: ${tab.textSnippet}
    `.trim();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const raw = (response.text || "").trim(); // exact text the model returned 
    const decision = raw === "1" ? 1 : 0; // turn model output into a binary decision

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