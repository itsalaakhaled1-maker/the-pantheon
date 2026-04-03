require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── GEMINI REST CALL (محسن لمعالجة الـ JSON بشكل أدق) ──────────────────────────
async function gemini(prompt, maxTokens = 3000) {
  const models = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens }, // تقليل الـ temperature لزيادة الدقة
        }),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;

      // تحسين استخراج الـ JSON لإزالة أي نصوص زائدة قد يضيفها الموديل
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;

      return JSON.parse(match[0]);
    } catch (e) {
      console.log(`Model ${model} error: ${e.message}`);
      continue;
    }
  }
  throw new Error("All Gemini models failed.");
}

// ─── ARCHETYPES (ثابتة كما هي) ────────────────────────────────────────────────
const ARCHETYPES = [
  { id: "macro_fortress",    name: "The Macro Fortress",    style: "trillion-dollar institutional committee, systemic risk and macro trends focused" },
  { id: "alpha_hunter",      name: "The Alpha Hunter",      style: "aggressive investment bank trading desk, seeks information edge and short-term alpha" },
  { id: "infinite_horizon",  name: "The Infinite Horizon",  style: "world's largest asset manager, thinks in decades, long-term compounding only" },
  { id: "cycle_reader",      name: "The Cycle Reader",      style: "macro hedge fund analyzing debt cycles and all-weather portfolio positioning" },
  { id: "signal_engine",     name: "The Signal Engine",     style: "pure quant firm, z-scores and expected value only, no narratives" },
  { id: "value_oracle",      name: "The Value Oracle",      style: "60-year value investing legend, seeks moats and margin of safety, ignores all noise" },
  { id: "reflexive_mind",    name: "The Reflexive Mind",    style: "global macro legend using reflexivity theory, bets massively on self-reinforcing trends" },
  { id: "the_skeptic",       name: "The Skeptic",           style: "deep contrarian who hunts bubbles and overvalued assets, distrusts all Wall Street consensus" },
  { id: "momentum_guardian", name: "The Momentum Guardian", style: "capital preservation first, follows momentum, cuts losses fast, risk management is religion" },
  { id: "the_disruptor",     name: "The Disruptor",         style: "visionary innovation investor, 5-year minimum horizon, bets on exponential tech disruption" },
];

// ─── TAVILY SEARCH (كما هو) ───────────────────────────────────────────────────
async function searchNews(asset, dateFrom, dateTo) {
  try {
    const query = `${asset} stock market analysis and financial performance ${dateFrom || "2025"} ${dateTo || ""}`;
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: "advanced", // تم تغييره لـ advanced لجلب بيانات أدق
        max_results: 5,
        include_answer: true,
      }),
    });
    const data = await res.json();
    return {
      summary: data.answer || "",
      articles: (data.results || []).map(r => ({
        title: r.title,
        content: r.content?.slice(0, 500),
        url: r.url
      })),
    };
  } catch (e) {
    return { summary: "", articles: [] };
  }
}

// ─── CALL 1: AGENTS (تعديل الـ Prompt لمنع التنوع الإجباري) ─────────────────────
async function runAllAgents(context) {
  const news = context.articles.map((a, i) => `${i+1}. ${a.title}: ${a.content}`).join("\n");

  const prompt = `You are a world-class financial analyst. Analyze ${context.asset} for the period ${context.dateFrom} to ${context.dateTo}.
  
CONTEXT: ${context.summary}
NEWS DATA:
${news}

INSTRUCTION: Analyze using the style of these 10 archetypes. 
CRITICAL: Do NOT force variety. If the news is overwhelmingly positive, most should say BUY. If negative, most should say SELL. Be realistic.

ARCHETYPES:
${ARCHETYPES.map(a => `- ${a.id}: ${a.style}`).join("\n")}

Return ONLY JSON:
{"agents":[{"id":"archetype_id","decision":"BUY/SELL/HOLD","confidence":0-100,"thesis":"Detailed 2-sentence analysis referencing specific news.","keyRisk":"Specific risk.","target":"Price target or direction.","timeHorizon":"Horizon."}]}`;

  return (await gemini(prompt)).agents || [];
}

// ─── CALL 2: REPORT (تعديل منطق التقرير ليكون أكثر ذكاءً) ──────────────────────
async function runCrowdAndReport(context, agents) {
  const prompt = `Based on these 10 expert votes: ${JSON.stringify(agents.map(a => a.decision))}
  And this news: ${context.summary}
  
  Generate a final investment report for ${context.asset}.
  - If consensus is strong, verdict must be "STRONG BUY" or "STRONG SELL".
  - Score (0-100) should reflect conviction.
  - NEVER use placeholder text like "perspective on...". Write original insights.

  Return ONLY JSON:
  {
    "crowd": { "groups": [...], "crowdDecision": "BUY/SELL/HOLD", "crowdSentiment": 0-100, "herdBehaviorRisk": "LOW/MEDIUM/HIGH", "crowdInsight": "..." },
    "report": { "verdict": "...", "score": 0-100, "summary": "...", "entryStrategy": "...", "stopLoss": "...", "topOpportunity": "...", "topRisk": "...", "scenarios": [...], "keyMetrics": [...], "timeHorizon": "..." }
  }`;

  return await gemini(prompt);
}

// ─── FALLBACK LOGIC (تعديل نظام الأغلبية لمنع الـ HOLD التلقائي) ────────────────
function getFallback(asset, agents) {
  const votes = agents.map(a => a.decision);
  const counts = { BUY: 0, SELL: 0, HOLD: 0 };
  votes.forEach(v => counts[v]++);

  // اختيار القرار بناءً على الأغلبية العظمى (Majority Wins)
  let finalVerdict = "HOLD";
  if (counts.BUY > counts.SELL && counts.BUY > counts.HOLD) finalVerdict = "BUY";
  else if (counts.SELL > counts.BUY && counts.SELL > counts.HOLD) finalVerdict = "SELL";

  const score = 50 + (counts.BUY * 5) - (counts.SELL * 5); // معادلة مرنة للسكور

  return {
    crowd: { crowdDecision: finalVerdict, crowdSentiment: score, groups: [] },
    report: { 
      verdict: finalVerdict, 
      score: Math.min(Math.max(score, 10), 95), 
      summary: `Analysis based on ${counts.BUY} Buy, ${counts.HOLD} Hold, and ${counts.SELL} Sell signals.`,
      entryStrategy: "Standard entry logic applied.",
      scenarios: []
    }
  };
}

// ─── MAIN ENDPOINT ────────────────────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  const { asset, dateFrom, dateTo } = req.body;
  try {
    const newsData = await searchNews(asset, dateFrom, dateTo);
    const context  = { asset, dateFrom, dateTo, ...newsData };

    let agentData = await runAllAgents(context);
    
    const archetypeResults = ARCHETYPES.map(a => {
      const d = agentData.find(x => x.id === a.id);
      return {
        ...a,
        decision: d?.decision || "HOLD",
        confidence: d?.confidence || 50,
        thesis: d?.thesis || `Analyzing ${asset} through the lens of ${a.name}.`,
        keyRisk: d?.keyRisk || "Market volatility",
        target: d?.target || "N/A",
        timeHorizon: d?.timeHorizon || "Medium Term"
      };
    });

    let result;
    try {
      result = await runCrowdAndReport(context, archetypeResults);
    } catch (e) {
      result = getFallback(asset, archetypeResults);
    }

    res.json({
      asset, dateFrom, dateTo,
      news: { summary: context.summary, articles: context.articles },
      archetypes: archetypeResults,
      crowd: result.crowd,
      report: result.report
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🏛️ Pantheon Engine Updated on port ${PORT}`));
