const fetch = require("node-fetch"); 
require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── GEMINI REST CALL (المطور والمستقر) ───────────────────────────────────────
async function gemini(prompt, maxTokens = 1500) {
  const models = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.0-flash",
    "gemini-1.0-pro",
  ];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { 
            temperature: 0.7, 
            maxOutputTokens: maxTokens // تقليل الـ tokens لضمان سرعة الاستجابة
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.log(`❌ Model ${model} failed: ${res.status} - ${errText}`);
        continue; 
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) continue;

      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;

      console.log(`✅ Success with Model: ${model}`);
      return JSON.parse(match[0]);

    } catch (e) {
      console.log(`🚨 Error with ${model}: ${e.message}`);
      continue;
    }
  }

  throw new Error("All Gemini models failed. Check your API Key in Railway Variables.");
}

// ─── 10 ARCHETYPES ────────────────────────────────────────────────────────────
const ARCHETYPES = [
  { id: "macro_fortress",    name: "The Macro Fortress",    emoji: "🏛️", style: "trillion-dollar institutional committee, systemic risk and macro trends focused" },
  { id: "alpha_hunter",      name: "The Alpha Hunter",      emoji: "🎯", style: "aggressive investment bank trading desk, seeks information edge and short-term alpha" },
  { id: "infinite_horizon",  name: "The Infinite Horizon",  emoji: "🌍", style: "world's largest asset manager, thinks in decades, long-term compounding only" },
  { id: "cycle_reader",      name: "The Cycle Reader",      emoji: "🌊", style: "macro hedge fund analyzing debt cycles and all-weather portfolio positioning" },
  { id: "signal_engine",     name: "The Signal Engine",     emoji: "⚡", style: "pure quant firm, z-scores and expected value only, no narratives" },
  { id: "value_oracle",      name: "The Value Oracle",      emoji: "🧙", style: "60-year value investing legend, seeks moats and margin of safety, ignores all noise" },
  { id: "reflexive_mind",    name: "The Reflexive Mind",    emoji: "🔮", style: "global macro legend using reflexivity theory, bets massively on self-reinforcing trends" },
  { id: "the_skeptic",       name: "The Skeptic",           emoji: "🐻", style: "deep contrarian who hunts bubbles and overvalued assets, distrusts all Wall Street consensus" },
  { id: "momentum_guardian", name: "The Momentum Guardian", emoji: "📈", style: "capital preservation first, follows momentum, cuts losses fast, risk management is religion" },
  { id: "the_disruptor",     name: "The Disruptor",         emoji: "🚀", style: "visionary innovation investor, 5-year minimum horizon, bets on exponential tech disruption" },
];

// ─── TAVILY SEARCH ────────────────────────────────────────────────────────────
async function searchNews(asset, dateFrom, dateTo) {
  try {
    const query = dateFrom
      ? `${asset} stock performance and analysis ${dateFrom} to ${dateTo}`
      : `${asset} stock market latest news`;

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: "advanced",
        max_results: 5,
        include_answer: true,
      }),
    });
    const data = await res.json();
    return {
      summary: data.answer || "",
      articles: (data.results || []).map(r => ({
        title: r.title,
        content: r.content?.slice(0, 300),
        url: r.url
      })),
    };
  } catch (e) {
    return { summary: "", articles: [] };
  }
}

// ─── CALL 1: AGENTS ───────────────────────────────────────────────────────────
async function runAllAgents(context) {
  const news = context.articles.map((a, i) => `${i+1}. ${a.title}: ${a.content}`).join("\n");
  const prompt = `Act as 10 investment archetypes analyzing ${context.asset}. 
Context: ${context.summary}
News: ${news}
Return ONLY JSON with "agents" array containing id, decision (BUY/SELL/HOLD), thesis, and confidence.`;

  return (await gemini(prompt, 1500)).agents || []; // استخدام 1500 توكن لضمان الاستجابة
}

// ─── CALL 2: REPORT ───────────────────────────────────────────────────────────
async function runCrowdAndReport(context, agents) {
  const prompt = `Generate a final investment report for ${context.asset} based on these votes: ${JSON.stringify(agents)}. 
  Return ONLY JSON with "crowd" and "report" objects.`;
  return await gemini(prompt, 1500);
}

// ─── FALLBACK ─────────────────────────────────────────────────────────────────
function getFallback(asset, agents) {
  const buyC = agents.filter(a => a.decision === "BUY").length;
  const v = buyC >= 5 ? "BUY" : "HOLD";
  return {
    crowd: { crowdDecision: v, crowdSentiment: 60, groups: [] },
    report: { verdict: v, score: 65, summary: `Analysis for ${asset} completed.`, scenarios: [] }
  };
}

// ─── ENDPOINT ─────────────────────────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  const { asset, dateFrom, dateTo } = req.body;
  try {
    const newsData = await searchNews(asset, dateFrom, dateTo);
    const context = { asset, dateFrom, dateTo, ...newsData };
    
    let agentData = await runAllAgents(context);
    const archetypeResults = ARCHETYPES.map(a => {
      const d = agentData.find(x => x.id === a.id);
      return { ...a, decision: d?.decision || "HOLD", thesis: d?.thesis || "Analyzing..." };
    });

    let result;
    try {
      result = await runCrowdAndReport(context, archetypeResults);
    } catch (e) {
      result = getFallback(asset, archetypeResults);
    }

    res.json({ asset, archetypes: archetypeResults, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🏛️ Pantheon Engine Live on port ${PORT}`);
});
