require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── GEMINI REST CALL ─────────────────────────────────────────────────────────
async function gemini(prompt, maxTokens = 3000) {
  // Try models in order until one works
  const models = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
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
          generationConfig: { temperature: 0.8, maxOutputTokens: maxTokens },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.log(`   Model ${model} failed: ${res.status}`);
        continue; // try next model
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) { console.log(`   Model ${model}: empty response`); continue; }

      const match = text.match(/\{[\s\S]*\}/);
      if (!match) { console.log(`   Model ${model}: no JSON`); continue; }

      console.log(`   ✅ Model ${model} worked!`);
      return JSON.parse(match[0]);

    } catch (e) {
      console.log(`   Model ${model} error: ${e.message}`);
      continue;
    }
  }

  throw new Error("All Gemini models failed. Check your API key.");
}

// ─── 10 ARCHETYPES ────────────────────────────────────────────────────────────
const ARCHETYPES = [
  { id: "macro_fortress",    name: "The Macro Fortress",    nameAr: "القلعة الكبرى",     emoji: "🏛️", type: "Institution",         typeAr: "مؤسسة",           style: "trillion-dollar institutional committee, systemic risk and macro trends focused" },
  { id: "alpha_hunter",      name: "The Alpha Hunter",      nameAr: "صائد الألفا",        emoji: "🎯", type: "Institution",         typeAr: "مؤسسة",           style: "aggressive investment bank trading desk, seeks information edge and short-term alpha" },
  { id: "infinite_horizon",  name: "The Infinite Horizon",  nameAr: "الأفق اللانهائي",   emoji: "🌍", type: "Institution",         typeAr: "مؤسسة",           style: "world's largest asset manager, thinks in decades, long-term compounding only" },
  { id: "cycle_reader",      name: "The Cycle Reader",      nameAr: "قارئ الدورات",       emoji: "🌊", type: "Institution",         typeAr: "مؤسسة",           style: "macro hedge fund analyzing debt cycles and all-weather portfolio positioning" },
  { id: "signal_engine",     name: "The Signal Engine",     nameAr: "محرك الإشارات",      emoji: "⚡", type: "Institution",         typeAr: "مؤسسة",           style: "pure quant firm, z-scores and expected value only, no narratives" },
  { id: "value_oracle",      name: "The Value Oracle",      nameAr: "عراف القيمة",        emoji: "🧙", type: "Legendary Investor",  typeAr: "مستثمر أسطوري",  style: "60-year value investing legend, seeks moats and margin of safety, ignores all noise" },
  { id: "reflexive_mind",    name: "The Reflexive Mind",    nameAr: "العقل الانعكاسي",   emoji: "🔮", type: "Legendary Investor",  typeAr: "مستثمر أسطوري",  style: "global macro legend using reflexivity theory, bets massively on self-reinforcing trends" },
  { id: "the_skeptic",       name: "The Skeptic",           nameAr: "المشكك",             emoji: "🐻", type: "Contrarian",          typeAr: "عكسي",            style: "deep contrarian who hunts bubbles and overvalued assets, distrusts all Wall Street consensus" },
  { id: "momentum_guardian", name: "The Momentum Guardian", nameAr: "حارس الزخم",         emoji: "📈", type: "Macro Trader",        typeAr: "متداول ماكرو",   style: "capital preservation first, follows momentum, cuts losses fast, risk management is religion" },
  { id: "the_disruptor",     name: "The Disruptor",         nameAr: "المدمر الخلاق",      emoji: "🚀", type: "Innovation Investor", typeAr: "مستثمر الابتكار", style: "visionary innovation investor, 5-year minimum horizon, bets on exponential tech disruption" },
];

// ─── TAVILY SEARCH ────────────────────────────────────────────────────────────
async function searchNews(asset, dateFrom, dateTo) {
  try {
    const query = dateFrom
      ? `${asset} stock market analysis ${dateFrom} ${dateTo}`
      : `${asset} stock investment news 2025`;

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
      articles: (data.results || []).map(r => ({
        title:   r.title,
        content: r.content?.slice(0, 300),
        url:     r.url,
        date:    r.published_date || "",
      })),
    };
  } catch (e) {
    console.error("Tavily error:", e.message);
    return { summary: "", articles: [] };
  }
}

// ─── CALL 1: ALL 10 AGENTS IN ONE PROMPT ─────────────────────────────────────
async function runAllAgents(context) {
  const news = context.articles.length
    ? context.articles.map((a, i) => `${i+1}. ${a.title}: ${a.content}`).join("\n")
    : `No specific news. Use general knowledge about ${context.asset}.`;

  const prompt = `Simulate 10 investment archetypes analyzing: ${context.asset}
${context.dateFrom ? `TIME PERIOD: ${context.dateFrom} to ${context.dateTo}` : ""}

MARKET CONTEXT: ${context.summary || "Current market"}

NEWS:
${news}

10 ARCHETYPES:
${ARCHETYPES.map((a,i) => `${i+1}. id="${a.id}" - ${a.style}`).join("\n")}

Analyze ${context.asset} for each archetype based on their style AND the actual news.
Make decisions VARIED and realistic — mix of BUY/SELL/HOLD based on each archetype's philosophy.

Return ONLY valid JSON:
{"agents":[
{"id":"macro_fortress","decision":"SELL","confidence":71,"thesis":"2 sentences in their voice referencing the actual news.","keyRisk":"Specific risk.","target":"Specific instrument.","timeHorizon":"Their typical horizon."},
{"id":"alpha_hunter","decision":"BUY","confidence":74,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
{"id":"infinite_horizon","decision":"HOLD","confidence":68,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
{"id":"cycle_reader","decision":"SELL","confidence":66,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
{"id":"signal_engine","decision":"BUY","confidence":79,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
{"id":"value_oracle","decision":"HOLD","confidence":72,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
{"id":"reflexive_mind","decision":"BUY","confidence":77,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
{"id":"the_skeptic","decision":"SELL","confidence":81,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
{"id":"momentum_guardian","decision":"BUY","confidence":70,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."},
{"id":"the_disruptor","decision":"BUY","confidence":83,"thesis":"...","keyRisk":"...","target":"...","timeHorizon":"..."}
]}

Replace ALL "..." with real analysis of ${context.asset}.`;

  const result = await gemini(prompt, 3000);
  return result.agents || [];
}

// ─── CALL 2: CROWD + REPORT ───────────────────────────────────────────────────
async function runCrowdAndReport(context, agents) {
  const buyC  = agents.filter(a => a.decision === "BUY").length;
  const sellC = agents.filter(a => a.decision === "SELL").length;
  const holdC = agents.filter(a => a.decision === "HOLD").length;

  const prompt = `Generate investment report and crowd simulation for: ${context.asset}
${context.dateFrom ? `PERIOD: ${context.dateFrom} to ${context.dateTo}` : ""}

EXPERT VOTES: BUY ${buyC}/10 | SELL ${sellC}/10 | HOLD ${holdC}/10
NEWS SUMMARY: ${context.summary || "General market analysis"}

Return ONLY valid JSON:
{
  "crowd":{
    "groups":[
      {"name":"Retail Traders","count":110,"decision":"BUY","sentiment":64,"reasoning":"One sentence."},
      {"name":"Conservative Savers","count":110,"decision":"HOLD","sentiment":43,"reasoning":"One sentence."},
      {"name":"Day Traders","count":110,"decision":"BUY","sentiment":71,"reasoning":"One sentence."},
      {"name":"Small Hedge Funds","count":110,"decision":"HOLD","sentiment":54,"reasoning":"One sentence."},
      {"name":"Tech Enthusiasts","count":110,"decision":"BUY","sentiment":76,"reasoning":"One sentence."},
      {"name":"Pension Managers","count":110,"decision":"HOLD","sentiment":46,"reasoning":"One sentence."},
      {"name":"EM Investors","count":110,"decision":"SELL","sentiment":37,"reasoning":"One sentence."},
      {"name":"Value Hunters","count":110,"decision":"BUY","sentiment":61,"reasoning":"One sentence."},
      {"name":"Momentum Traders","count":110,"decision":"BUY","sentiment":69,"reasoning":"One sentence."}
    ],
    "crowdDecision":"BUY",
    "crowdSentiment":58,
    "herdBehaviorRisk":"MEDIUM",
    "crowdInsight":"One powerful specific insight about ${context.asset} crowd behavior."
  },
  "report":{
    "verdict":"BUY",
    "score":67,
    "summary":"3-4 specific sentences about ${context.asset} based on expert votes and news.",
    "buyPercentage":${buyC*10},
    "holdPercentage":${holdC*10},
    "sellPercentage":${sellC*10},
    "entryStrategy":"Specific practical entry advice for ${context.asset}.",
    "stopLoss":"Specific stop loss for ${context.asset}.",
    "topOpportunity":"Biggest specific opportunity for ${context.asset}.",
    "topRisk":"Biggest specific risk for ${context.asset}.",
    "scenarios":[
      {"name":"Bull Case","probability":35,"description":"Specific bull scenario for ${context.asset}."},
      {"name":"Base Case","probability":45,"description":"Most likely outcome for ${context.asset}."},
      {"name":"Bear Case","probability":20,"description":"Specific bear scenario for ${context.asset}."}
    ],
    "keyMetrics":["Specific metric 1","Specific metric 2","Specific metric 3"],
    "timeHorizon":"Recommended investment horizon."
  }
}
Replace ALL placeholder text with real analysis. verdict must be: STRONG BUY, BUY, HOLD, SELL, or STRONG SELL`;

  return await gemini(prompt, 2000);
}

// ─── FALLBACK DATA ────────────────────────────────────────────────────────────
function getFallback(asset, agents) {
  const buyC  = agents.filter(a => a.decision === "BUY").length;
  const sellC = agents.filter(a => a.decision === "SELL").length;
  const holdC = agents.filter(a => a.decision === "HOLD").length;
  const v = buyC >= 5 ? "BUY" : sellC >= 5 ? "SELL" : "HOLD";
  return {
    crowd: {
      groups: [
        {name:"Retail Traders",count:110,decision:"BUY",sentiment:62,reasoning:"Following positive momentum."},
        {name:"Conservative Savers",count:110,decision:"HOLD",sentiment:44,reasoning:"Cautious long-term approach."},
        {name:"Day Traders",count:110,decision:"BUY",sentiment:68,reasoning:"Technical breakout signals."},
        {name:"Small Hedge Funds",count:110,decision:"HOLD",sentiment:51,reasoning:"Awaiting confirmation."},
        {name:"Tech Enthusiasts",count:110,decision:"BUY",sentiment:75,reasoning:"Strong growth narrative."},
        {name:"Pension Managers",count:110,decision:"HOLD",sentiment:46,reasoning:"Stability first approach."},
        {name:"EM Investors",count:110,decision:"SELL",sentiment:39,reasoning:"Global risk concerns."},
        {name:"Value Hunters",count:110,decision:"BUY",sentiment:60,reasoning:"Trading below intrinsic value."},
        {name:"Momentum Traders",count:110,decision:v,sentiment:66,reasoning:"Trend continues."},
      ],
      crowdDecision: v, crowdSentiment: 57, herdBehaviorRisk: "MEDIUM",
      crowdInsight: `Mixed crowd sentiment for ${asset} with slight ${v} bias.`,
    },
    report: {
      verdict: v, score: 50 + buyC * 4,
      summary: `${asset} shows ${buyC} buy, ${holdC} hold, ${sellC} sell signals from 10 expert archetypes.`,
      buyPercentage: buyC*10, holdPercentage: holdC*10, sellPercentage: sellC*10,
      entryStrategy: `Enter ${asset} position gradually over 2-3 tranches.`,
      stopLoss: "8-10% below entry price.",
      topOpportunity: `${asset} upside if market conditions improve.`,
      topRisk: "Macro uncertainty and sector rotation risk.",
      scenarios: [
        {name:"Bull Case",probability:35,description:`${asset} outperforms on positive catalysts.`},
        {name:"Base Case",probability:45,description:`${asset} consolidates near current levels.`},
        {name:"Bear Case",probability:20,description:`${asset} declines on macro headwinds.`},
      ],
      keyMetrics: ["Revenue growth rate","Profit margin trends","Market sentiment index"],
      timeHorizon: "6-12 months",
    },
  };
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

    // 2. All 10 agents — 1 Gemini call
    console.log("🧠 Running 10 agents...");
    let agentData = [];
    try {
      agentData = await runAllAgents(context);
      console.log(`   Got ${agentData.length} agent responses`);
    } catch (e) {
      console.error("Agents failed:", e.message);
    }

    // Merge with archetype metadata
    const archetypeResults = ARCHETYPES.map((a, i) => {
      const d = agentData.find(x => x.id === a.id);
      return {
        ...a,
        decision:    d?.decision    || ["BUY","HOLD","SELL","BUY","HOLD","SELL","BUY","HOLD","BUY","SELL"][i],
        confidence:  d?.confidence  || (60 + i * 3),
        allocation:  "3-5% of portfolio",
        thesis:      d?.thesis      || `${a.name} perspective on ${asset}.`,
        keyRisk:     d?.keyRisk     || "Market volatility.",
        target:      d?.target      || asset,
        timeHorizon: d?.timeHorizon || "6-12 months",
      };
    });

    // 3. Crowd + Report — 1 Gemini call
    console.log("👥📊 Generating crowd + report...");
    let crowd, report;
    try {
      const combined = await runCrowdAndReport(context, archetypeResults);
      crowd  = combined.crowd;
      report = combined.report;
    } catch (e) {
      console.error("Crowd/Report failed:", e.message);
      const fb = getFallback(asset, archetypeResults);
      crowd  = fb.crowd;
      report = fb.report;
    }

    console.log(`✅ Done! Verdict: ${report.verdict}`);

    res.json({
      asset, dateFrom, dateTo,
      news: { summary: context.summary, articles: context.articles },
      archetypes: archetypeResults,
      crowd, report,
    });

  } catch (err) {
    console.error("❌ Fatal:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok", name: "The Pantheon" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n🏛️  The Pantheon on port ${PORT}\n`));
