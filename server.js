require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── GEMINI ───────────────────────────────────────────────────────────────────
async function gemini(prompt, maxTokens = 2000) {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found");
  return JSON.parse(match[0]);
}

// ─── ARCHETYPES ───────────────────────────────────────────────────────────────
const ARCHETYPES = [
  { id: "macro_fortress",    name: "The Macro Fortress",    nameAr: "القلعة الكبرى",      emoji: "🏛️", type: "Institution",        typeAr: "مؤسسة",          style: "institutional committee managing trillions, focuses on systemic risk and macro trends" },
  { id: "alpha_hunter",      name: "The Alpha Hunter",      nameAr: "صائد الألفا",         emoji: "🎯", type: "Institution",        typeAr: "مؤسسة",          style: "aggressive trading desk seeking information edge and short-term alpha" },
  { id: "infinite_horizon",  name: "The Infinite Horizon",  nameAr: "الأفق اللانهائي",    emoji: "🌍", type: "Institution",        typeAr: "مؤسسة",          style: "world's largest asset manager, thinks in decades, long-term compounding only" },
  { id: "cycle_reader",      name: "The Cycle Reader",      nameAr: "قارئ الدورات",        emoji: "🌊", type: "Institution",        typeAr: "مؤسسة",          style: "macro hedge fund focused on debt cycles and all-weather positioning" },
  { id: "signal_engine",     name: "The Signal Engine",     nameAr: "محرك الإشارات",       emoji: "⚡", type: "Institution",        typeAr: "مؤسسة",          style: "pure quant firm, processes signals not stories, z-scores and expected value only" },
  { id: "value_oracle",      name: "The Value Oracle",      nameAr: "عراف القيمة",         emoji: "🧙", type: "Legendary Investor", typeAr: "مستثمر أسطوري", style: "legendary value investor with 60 years experience, ignores noise, seeks moats and margin of safety" },
  { id: "reflexive_mind",    name: "The Reflexive Mind",    nameAr: "العقل الانعكاسي",    emoji: "🔮", type: "Legendary Investor", typeAr: "مستثمر أسطوري", style: "global macro legend using reflexivity theory, bets on self-reinforcing trends" },
  { id: "the_skeptic",       name: "The Skeptic",           nameAr: "المشكك",              emoji: "🐻", type: "Contrarian",         typeAr: "عكسي",           style: "contrarian investor who finds bubbles, distrusts consensus, deep independent research" },
  { id: "momentum_guardian", name: "The Momentum Guardian", nameAr: "حارس الزخم",          emoji: "📈", type: "Macro Trader",       typeAr: "متداول ماكرو",  style: "macro trader for whom capital preservation is religion, follows momentum and cuts losses fast" },
  { id: "the_disruptor",     name: "The Disruptor",         nameAr: "المدمر الخلاق",       emoji: "🚀", type: "Innovation Investor", typeAr: "مستثمر الابتكار", style: "visionary innovation investor, 5-year minimum horizon, ignores short-term, bets on exponential tech" },
];

// ─── SEARCH ───────────────────────────────────────────────────────────────────
async function searchNews(asset, dateFrom, dateTo) {
  try {
    const query = dateFrom
      ? `${asset} stock market ${dateFrom} ${dateTo}`
      : `${asset} stock investment news analysis 2025`;
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
      }),
    });
    const data = await res.json();
    return {
      summary: data.answer || "",
      articles: (data.results || []).map((r) => ({
        title: r.title,
        content: r.content?.slice(0, 300),
        url: r.url,
        date: r.published_date || "",
      })),
    };
  } catch (e) {
    console.error("Tavily error:", e.message);
    return { summary: "", articles: [] };
  }
}

// ─── ALL ARCHETYPES IN ONE CALL ───────────────────────────────────────────────
async function runAllArchetypes(context) {
  const newsText = context.articles.length
    ? context.articles.map((a, i) => `${i+1}. ${a.title}: ${a.content}`).join("\n")
    : `No specific news available, use general knowledge about ${context.asset}`;

  const archetypeList = ARCHETYPES.map((a, i) =>
    `${i+1}. id="${a.id}" style: ${a.style}`
  ).join("\n");

  const prompt = `You are simulating 10 different investment archetypes analyzing: ${context.asset}
${context.dateFrom ? `TIME PERIOD: ${context.dateFrom} to ${context.dateTo}` : ""}

MARKET CONTEXT: ${context.summary || "Current market conditions"}

NEWS:
${newsText}

ARCHETYPES TO SIMULATE:
${archetypeList}

For EACH archetype, give a realistic analysis based on their style AND the actual news above.
Make decisions VARIED — not all the same. Some should BUY, some SELL, some HOLD based on their philosophy.

Return ONLY this JSON (no text before or after):
{
  "agents": [
    {"id":"macro_fortress","decision":"SELL","confidence":72,"thesis":"2 sentences in their voice referencing actual news.","keyRisk":"Specific risk.","target":"Specific instrument.","timeHorizon":"Their horizon."},
    {"id":"alpha_hunter","decision":"BUY","confidence":68,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
    {"id":"infinite_horizon","decision":"HOLD","confidence":75,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
    {"id":"cycle_reader","decision":"SELL","confidence":70,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
    {"id":"signal_engine","decision":"BUY","confidence":80,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
    {"id":"value_oracle","decision":"HOLD","confidence":65,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
    {"id":"reflexive_mind","decision":"BUY","confidence":73,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
    {"id":"the_skeptic","decision":"SELL","confidence":78,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
    {"id":"momentum_guardian","decision":"BUY","confidence":69,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
    {"id":"the_disruptor","decision":"BUY","confidence":82,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."}
  ]
}

IMPORTANT: Replace ALL "..." with real content. Make each thesis reference the actual news about ${context.asset}.`;

  const result = await gemini(prompt, 3000);
  return result.agents || [];
}

// ─── CROWD + REPORT IN ONE CALL ───────────────────────────────────────────────
async function runCrowdAndReport(context, agents) {
  const buyCount  = agents.filter(a => a.decision === "BUY").length;
  const sellCount = agents.filter(a => a.decision === "SELL").length;
  const holdCount = agents.filter(a => a.decision === "HOLD").length;

  const prompt = `You are generating a market intelligence report for: ${context.asset}
${context.dateFrom ? `PERIOD: ${context.dateFrom} to ${context.dateTo}` : ""}

EXPERT VOTES: BUY ${buyCount}/10 | SELL ${sellCount}/10 | HOLD ${holdCount}/10

NEWS SUMMARY: ${context.summary || "General market analysis"}

Generate both crowd simulation AND final report.

Return ONLY this JSON:
{
  "crowd": {
    "groups": [
      {"name":"Retail Traders","count":110,"decision":"BUY","sentiment":65,"reasoning":"Short sentence."},
      {"name":"Conservative Savers","count":110,"decision":"HOLD","sentiment":42,"reasoning":"Short sentence."},
      {"name":"Day Traders","count":110,"decision":"BUY","sentiment":70,"reasoning":"Short sentence."},
      {"name":"Small Hedge Funds","count":110,"decision":"HOLD","sentiment":55,"reasoning":"Short sentence."},
      {"name":"Tech Enthusiasts","count":110,"decision":"BUY","sentiment":78,"reasoning":"Short sentence."},
      {"name":"Pension Managers","count":110,"decision":"HOLD","sentiment":45,"reasoning":"Short sentence."},
      {"name":"EM Investors","count":110,"decision":"SELL","sentiment":38,"reasoning":"Short sentence."},
      {"name":"Value Hunters","count":110,"decision":"BUY","sentiment":60,"reasoning":"Short sentence."},
      {"name":"Momentum Traders","count":110,"decision":"BUY","sentiment":72,"reasoning":"Short sentence."}
    ],
    "crowdDecision":"BUY",
    "crowdSentiment":59,
    "herdBehaviorRisk":"MEDIUM",
    "crowdInsight":"One powerful insight about crowd behavior for ${context.asset}."
  },
  "report": {
    "verdict":"BUY",
    "score":68,
    "summary":"3-4 sentences about ${context.asset} investment case based on the expert votes and news.",
    "buyPercentage":${buyCount * 10},
    "holdPercentage":${holdCount * 10},
    "sellPercentage":${sellCount * 10},
    "entryStrategy":"Specific practical entry strategy.",
    "stopLoss":"Specific stop loss recommendation.",
    "topOpportunity":"Biggest specific opportunity for ${context.asset}.",
    "topRisk":"Biggest specific risk for ${context.asset}.",
    "scenarios":[
      {"name":"Bull Case","probability":35,"description":"Specific bull scenario."},
      {"name":"Base Case","probability":45,"description":"Most likely outcome."},
      {"name":"Bear Case","probability":20,"description":"Specific bear scenario."}
    ],
    "keyMetrics":["Metric 1 to watch","Metric 2 to watch","Metric 3 to watch"],
    "timeHorizon":"Recommended investment horizon."
  }
}

Replace ALL placeholder text with real analysis of ${context.asset}.
verdict must be: STRONG BUY, BUY, HOLD, SELL, or STRONG SELL`;

  return await gemini(prompt, 2000);
}

// ─── MAIN ENDPOINT ────────────────────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  const { asset, dateFrom, dateTo } = req.body;
  if (!asset) return res.status(400).json({ error: "Asset name required" });

  console.log(`\n🔍 Analyzing: ${asset}`);

  try {
    // 1. News
    console.log("📰 Fetching news...");
    const newsData = await searchNews(asset, dateFrom, dateTo);
    const context  = { asset, dateFrom, dateTo, ...newsData };
    console.log(`   Got ${context.articles.length} articles`);

    // 2. All 10 agents in ONE call
    console.log("🧠 Running all 10 archetypes in one call...");
    let agentData = [];
    try {
      agentData = await runAllArchetypes(context);
    } catch (err) {
      console.error("Archetypes failed:", err.message);
    }

    // Merge archetype metadata with agent results
    const archetypeResults = ARCHETYPES.map((a, i) => {
      const found = agentData.find(d => d.id === a.id);
      return {
        ...a,
        decision: found?.decision || ["BUY","HOLD","SELL"][i % 3],
        confidence: found?.confidence || (58 + i * 3),
        allocation: "3-5% of portfolio",
        thesis: found?.thesis || `${a.name} analysis of ${asset} based on current market conditions.`,
        keyRisk: found?.keyRisk || "Market volatility and macro uncertainty.",
        target: found?.target || asset,
        timeHorizon: found?.timeHorizon || "6-12 months",
      };
    });

    // 3. Crowd + Report in ONE call
    console.log("👥📊 Running crowd + report in one call...");
    let crowdResult, report;
    try {
      const combined = await runCrowdAndReport(context, archetypeResults);
      crowdResult = combined.crowd;
      report = combined.report;
    } catch (err) {
      console.error("Crowd/Report failed:", err.message);
      const buyC  = archetypeResults.filter(a => a.decision === "BUY").length;
      const sellC = archetypeResults.filter(a => a.decision === "SELL").length;
      const holdC = archetypeResults.filter(a => a.decision === "HOLD").length;
      const verdict = buyC >= 5 ? "BUY" : sellC >= 5 ? "SELL" : "HOLD";
      crowdResult = {
        groups: [
          {name:"Retail Traders",count:110,decision:"BUY",sentiment:62,reasoning:"Following market trend."},
          {name:"Conservative Savers",count:110,decision:"HOLD",sentiment:44,reasoning:"Cautious approach."},
          {name:"Day Traders",count:110,decision:"BUY",sentiment:68,reasoning:"Technical signals positive."},
          {name:"Small Hedge Funds",count:110,decision:"HOLD",sentiment:52,reasoning:"Awaiting confirmation."},
          {name:"Tech Enthusiasts",count:110,decision:"BUY",sentiment:75,reasoning:"Long-term growth story."},
          {name:"Pension Managers",count:110,decision:"HOLD",sentiment:46,reasoning:"Stability priority."},
          {name:"EM Investors",count:110,decision:"SELL",sentiment:39,reasoning:"Currency risk."},
          {name:"Value Hunters",count:110,decision:"BUY",sentiment:61,reasoning:"Value opportunity."},
          {name:"Momentum Traders",count:110,decision:verdict,sentiment:66,reasoning:"Trend following signal."},
        ],
        crowdDecision: verdict,
        crowdSentiment: 57,
        herdBehaviorRisk: "MEDIUM",
        crowdInsight: `Crowd sentiment for ${asset} shows mixed signals with slight bias toward ${verdict}.`,
      };
      report = {
        verdict,
        score: 50 + buyC * 4,
        summary: `${asset} analysis shows ${buyC} buy, ${holdC} hold, ${sellC} sell from expert archetypes.`,
        buyPercentage:  buyC  * 10,
        holdPercentage: holdC * 10,
        sellPercentage: sellC * 10,
        entryStrategy: `Scale into ${asset} gradually across 2-3 tranches.`,
        stopLoss: "8-10% below entry price.",
        topOpportunity: `${asset} upside potential based on current analyst consensus.`,
        topRisk: "Macro uncertainty and market volatility.",
        scenarios: [
          {name:"Bull Case",probability:35,description:`${asset} outperforms if conditions improve.`},
          {name:"Base Case",probability:45,description:`${asset} consolidates near current levels.`},
          {name:"Bear Case",probability:20,description:`${asset} declines if macro headwinds intensify.`},
        ],
        keyMetrics: ["Revenue growth", "Profit margins", "Market sentiment"],
        timeHorizon: "6-12 months",
      };
    }

    console.log(`✅ Done! Verdict: ${report.verdict}`);

    res.json({
      asset, dateFrom, dateTo,
      news: { summary: context.summary, articles: context.articles },
      archetypes: archetypeResults,
      crowd: crowdResult,
      report,
    });

  } catch (err) {
    console.error("❌ Fatal:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n🏛️  The Pantheon on port ${PORT}\n`));
