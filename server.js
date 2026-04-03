require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── GEMINI REST CALL (Stable & Flexible) ─────────────────────────────────────
async function gemini(prompt, maxTokens = 3000) {
  // الترتيب حسب الاستقرار لضمان عدم فشل الطلب في Railway
  const models = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.0-pro"
  ];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7 } 
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        console.error(`   Model ${model} failed:`, errData.error?.message || res.status);
        continue;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;

      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;

      console.log(`   ✅ Model ${model} worked!`);
      return JSON.parse(match[0]);

    } catch (e) {
      console.error(`   Error calling ${model}: ${e.message}`);
      continue;
    }
  }

  throw new Error("All Gemini models failed. Check your API key in Railway Variables.");
}

// ─── 10 ARCHETYPES ────────────────────────────────────────────────────────────
const ARCHETYPES = [
  { id: "macro_fortress",    name: "The Macro Fortress",    emoji: "🏛️", type: "Institution",         style: "trillion-dollar institutional committee, systemic risk and macro trends focused" },
  { id: "alpha_hunter",      name: "The Alpha Hunter",      emoji: "🎯", type: "Institution",         style: "aggressive investment bank trading desk, seeks information edge and short-term alpha" },
  { id: "infinite_horizon",  name: "The Infinite Horizon",  emoji: "🌍", type: "Institution",         style: "world's largest asset manager, thinks in decades, long-term compounding only" },
  { id: "cycle_reader",      name: "The Cycle Reader",      emoji: "🌊", type: "Institution",         style: "macro hedge fund analyzing debt cycles and all-weather portfolio positioning" },
  { id: "signal_engine",     name: "The Signal Engine",     emoji: "⚡", type: "Institution",         style: "pure quant firm, z-scores and expected value only, no narratives" },
  { id: "value_oracle",      name: "The Value Oracle",      emoji: "🧙", type: "Legendary Investor",  style: "60-year value investing legend, seeks moats and margin of safety, ignores all noise" },
  { id: "reflexive_mind",    name: "The Reflexive Mind",    emoji: "🔮", type: "Legendary Investor",  style: "global macro legend using reflexivity theory, bets massively on self-reinforcing trends" },
  { id: "the_skeptic",       name: "The Skeptic",           emoji: "🐻", type: "Contrarian",          style: "deep contrarian who hunts bubbles and overvalued assets, distrusts all Wall Street consensus" },
  { id: "momentum_guardian", name: "The Momentum Guardian", emoji: "📈", type: "Macro Trader",        style: "capital preservation first, follows momentum, cuts losses fast, risk management is religion" },
  { id: "the_disruptor",     name: "The Disruptor",         emoji: "🚀", type: "Innovation Investor", style: "visionary innovation investor, 5-year minimum horizon, bets on exponential tech disruption" },
];

// ─── TAVILY SEARCH (Advanced Depth) ───────────────────────────────────────────
async function searchNews(asset, dateFrom, dateTo) {
  try {
    const query = dateFrom
      ? `${asset} stock financial news and performance from ${dateFrom} to ${dateTo}`
      : `${asset} stock market latest analysis`;

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: "advanced",
        max_results: 6,
        include_answer: true,
      }),
    });
    const data = await res.json();
    return {
      summary: data.answer || "",
      articles: (data.results || []).map(r => ({
        title:   r.title,
        content: r.content?.slice(0, 400),
        url:     r.url
      })),
    };
  } catch (e) {
    console.error("Tavily error:", e.message);
    return { summary: "", articles: [] };
  }
}

// ─── CALL 1: EXPERT ANALYSIS (Objective & Dynamic) ───────────────────────────
async function runAllAgents(context) {
  const news = context.articles.map((a, i) => `${i+1}. ${a.title}: ${a.content}`).join("\n");

  const prompt = `Analyze ${context.asset} for the period ${context.dateFrom} to ${context.dateTo}.
MARKET DATA SUMMARY: ${context.summary}
NEWS FEED:
${news}

INSTRUCTIONS:
1. Act as 10 different investment archetypes (styles provided below).
2. Base your decision (BUY, SELL, or HOLD) strictly on the provided news and your archetype's logic.
3. CRITICAL: Do NOT force variety. If news is overwhelmingly bullish, most should BUY.
4. Write unique, 2-sentence theses for each. No placeholders.

ARCHETYPES:
${ARCHETYPES.map(a => `- ${a.id}: ${a.style}`).join("\n")}

Return ONLY valid JSON:
{"agents":[{"id":"archetype_id","decision":"BUY/SELL/HOLD","confidence":60-95,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."}]}`;

  const result = await gemini(prompt);
  return result.agents || [];
}

// ─── CALL 2: REPORT GENERATION (Consensus Driven) ────────────────────────────
async function runCrowdAndReport(context, agents) {
  const votes = agents.map(a => a.decision);
  
  const prompt = `Create a final report for ${context.asset} based on these expert votes: ${votes.join(", ")}.
NEWS CONTEXT: ${context.summary}

REQUIREMENTS:
- Verdict must be: STRONG BUY, BUY, HOLD, SELL, or STRONG SELL.
- If majority is BUY, verdict must reflect that.
- Score (0-100) must reflect the conviction of the majority.
- Generate realistic crowd sentiment data.

Return ONLY JSON:
{
  "crowd": { "groups": [...], "crowdDecision": "...", "crowdSentiment": 0-100, "herdBehaviorRisk": "...", "crowdInsight": "..." },
  "report": { "verdict": "...", "score": 0-100, "summary": "...", "entryStrategy": "...", "stopLoss": "...", "topOpportunity": "...", "topRisk": "...", "scenarios": [...], "keyMetrics": [...], "timeHorizon": "..." }
}`;

  return await gemini(prompt);
}

// ─── FALLBACK LOGIC (Majority Rule) ───────────────────────────────────────────
function getFallback(asset, agents) {
  const buyC  = agents.filter(a => a.decision === "BUY").length;
  const sellC = agents.filter(a => a.decision === "SELL").length;
  const holdC = agents.filter(a => a.decision === "HOLD").length;
  
  let v = "HOLD";
  if (buyC > sellC && buyC > holdC) v = "BUY";
  else if (sellC > buyC && sellC > holdC) v = "SELL";

  const score = 50 + (buyC * 5) - (sellC * 5);

  return {
    crowd: { crowdDecision: v, crowdSentiment: score, groups: [], herdBehaviorRisk: "MEDIUM", crowdInsight: "Fallback data used." },
    report: {
      verdict: v, score: Math.min(Math.max(score, 10), 95),
      summary: `Consensus: ${buyC} Buy, ${holdC} Hold, ${sellC} Sell.`,
      entryStrategy: "Standard position sizing.",
      stopLoss: "10% trailing.",
      topOpportunity: "Trend continuation.",
      topRisk: "Macro shifts.",
      scenarios: [], keyMetrics: ["Momentum", "Volume"], timeHorizon: "6-12m"
    }
  };
}

// ─── MAIN ENDPOINT ────────────────────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  const { asset, dateFrom, dateTo } = req.body;
  if (!asset) return res.status(400).json({ error: "Asset name required" });

  console.log(`\n🔍 Pantheon Analysis Started: ${asset}`);

  try {
    const newsData = await searchNews(asset, dateFrom, dateTo);
    const context  = { asset, dateFrom, dateTo, ...newsData };

    let agentData = await runAllAgents(context);

    const archetypeResults = ARCHETYPES.map(a => {
      const d = agentData.find(x => x.id === a.id);
      return {
        ...a,
        decision: d?.decision || "HOLD",
        confidence: d?.confidence || 65,
        thesis: d?.thesis || `Standard analysis for ${asset}.`,
        keyRisk: d?.keyRisk || "Volatility",
        target: d?.target || "Market",
        timeHorizon: d?.timeHorizon || "Medium Term"
      };
    });

    let crowd, report;
    try {
      const combined = await runCrowdAndReport(context, archetypeResults);
      crowd  = combined.crowd;
      report = combined.report;
    } catch (e) {
      const fb = getFallback(asset, archetypeResults);
      crowd = fb.crowd; report = fb.report;
    }

    res.json({ asset, news: { summary: context.summary, articles: context.articles }, archetypes: archetypeResults, crowd, report });

  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🏛️  The Pantheon Engine Live on port ${PORT}`));
