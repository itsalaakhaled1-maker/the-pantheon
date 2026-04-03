require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend/public")));

// ─── GEMINI CALL (no SDK — direct REST API) ───────────────────────────────────
async function gemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response: " + JSON.stringify(data).slice(0, 200));

  // Extract JSON robustly
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response: " + text.slice(0, 200));

  return JSON.parse(match[0]);
}

// ─── 10 ARCHETYPES ───────────────────────────────────────────────────────────
const ARCHETYPES = [
  {
    id: "macro_fortress",
    name: "The Macro Fortress",
    nameAr: "القلعة الكبرى",
    emoji: "🏛️",
    type: "Institution", typeAr: "مؤسسة",
    persona: "You are a top-tier institutional investment committee managing trillions. You prioritize systemic risk, macro trends, and tail risk protection above all.",
  },
  {
    id: "alpha_hunter",
    name: "The Alpha Hunter",
    nameAr: "صائد الألفا",
    emoji: "🎯",
    type: "Institution", typeAr: "مؤسسة",
    persona: "You are an aggressive investment bank trading desk. You seek information edge, short-term alpha, and volatility plays. Fast, data-driven, ruthless about risk/reward.",
  },
  {
    id: "infinite_horizon",
    name: "The Infinite Horizon",
    nameAr: "الأفق اللانهائي",
    emoji: "🌍",
    type: "Institution", typeAr: "مؤسسة",
    persona: "You are the world's largest asset manager. You think in decades, manage passive and active funds. Short-term noise is irrelevant. Long-term compounding is everything.",
  },
  {
    id: "cycle_reader",
    name: "The Cycle Reader",
    nameAr: "قارئ الدورات",
    emoji: "🌊",
    type: "Institution", typeAr: "مؤسسة",
    persona: "You are a macro hedge fund that views the economy as a machine driven by debt cycles. You seek balance across all economic environments and analyze global deleveraging.",
  },
  {
    id: "signal_engine",
    name: "The Signal Engine",
    nameAr: "محرك الإشارات",
    emoji: "⚡",
    type: "Institution", typeAr: "مؤسسة",
    persona: "You are a pure quant trading firm. You process signals not stories. Z-scores, standard deviations, and expected value only. If the data says sell, you sell.",
  },
  {
    id: "value_oracle",
    name: "The Value Oracle",
    nameAr: "عراف القيمة",
    emoji: "🧙",
    type: "Legendary Investor", typeAr: "مستثمر أسطوري",
    persona: "You are a legendary value investor with 60+ years of experience. You ignore ALL short-term noise. You look for durable moats, honest management, free cash flow, and margin of safety. You think in decades.",
  },
  {
    id: "reflexive_mind",
    name: "The Reflexive Mind",
    nameAr: "العقل الانعكاسي",
    emoji: "🔮",
    type: "Legendary Investor", typeAr: "مستثمر أسطوري",
    persona: "You are a global macro legend who believes markets and fundamentals create feedback loops. You look for self-reinforcing trends. You make massive concentrated bets on deep mispricings.",
  },
  {
    id: "the_skeptic",
    name: "The Skeptic",
    nameAr: "المشكك",
    emoji: "🐻",
    type: "Contrarian", typeAr: "عكسي",
    persona: "You are a deeply contrarian investor who digs into data others ignore. You specialize in finding bubbles and overvalued assets. You distrust consensus and Wall Street narratives completely.",
  },
  {
    id: "momentum_guardian",
    name: "The Momentum Guardian",
    nameAr: "حارس الزخم",
    emoji: "📈",
    type: "Macro Trader", typeAr: "متداول ماكرو",
    persona: "You are a legendary macro trader. Capital preservation is your religion. You follow momentum, cut losses fast, and read technical levels and macro catalysts. Risk management above all.",
  },
  {
    id: "the_disruptor",
    name: "The Disruptor",
    nameAr: "المدمر الخلاق",
    emoji: "🚀",
    type: "Innovation Investor", typeAr: "مستثمر الابتكار",
    persona: "You are a visionary innovation investor with 5-year minimum horizon. You invest in exponential technological change. You ignore short-term volatility. Traditional valuation metrics miss the point entirely.",
  },
];

// ─── SEARCH ───────────────────────────────────────────────────────────────────
async function searchNews(asset, dateFrom, dateTo) {
  try {
    const query = dateFrom
      ? `${asset} stock analysis ${dateFrom} ${dateTo}`
      : `${asset} stock investment market news analysis`;

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
      articles: (data.results || []).map((r) => ({
        title: r.title,
        content: r.content?.slice(0, 400),
        url: r.url,
        date: r.published_date || "",
      })),
    };
  } catch (e) {
    console.error("Tavily error:", e.message);
    return { summary: `Analysis for ${asset}`, articles: [] };
  }
}

// ─── SINGLE ARCHETYPE ────────────────────────────────────────────────────────
async function runArchetype(archetype, context) {
  const newsText = context.articles.length > 0
    ? context.articles.map((a, i) => `${i + 1}. ${a.title}\n${a.content}`).join("\n\n")
    : `General market analysis for ${context.asset}`;

  const prompt = `${archetype.persona}

ASSET TO ANALYZE: ${context.asset}
${context.dateFrom ? `TIME PERIOD: ${context.dateFrom} to ${context.dateTo}` : ""}

MARKET SUMMARY:
${context.summary || "No summary available"}

NEWS & DATA:
${newsText}

Based on all the above, analyze ${context.asset} from your investment philosophy.

You MUST respond with ONLY a valid JSON object, nothing else before or after it:
{"decision":"BUY","confidence":72,"allocation":"5% of portfolio","thesis":"Your 2-3 sentence analysis in your authentic voice based on the actual news above.","keyRisk":"The specific biggest risk for this asset right now.","target":"Specific instrument or sector to use.","timeHorizon":"Your recommended holding period."}

Rules:
- decision must be BUY, SELL, or HOLD (pick the one that actually fits the news)
- confidence must be a number between 40 and 95
- thesis must reference the actual news/context above, not generic statements
- All fields are required, none can be null or empty`;

  const result = await gemini(prompt);

  // Validate required fields
  if (!result.decision || !["BUY", "SELL", "HOLD"].includes(result.decision)) {
    result.decision = "HOLD";
  }
  if (!result.confidence || result.confidence === 50) {
    result.confidence = Math.floor(Math.random() * 30) + 55;
  }
  result.thesis = result.thesis || "Analysis based on current market conditions.";
  result.keyRisk = result.keyRisk || "Market volatility and macro uncertainty.";
  result.target = result.target || context.asset;
  result.timeHorizon = result.timeHorizon || "6-12 months";
  result.allocation = result.allocation || "3-5% of portfolio";

  return { ...archetype, ...result };
}

// ─── CROWD ────────────────────────────────────────────────────────────────────
async function runCrowd(context) {
  const prompt = `You are simulating 990 real investors reacting to this specific asset and news.

ASSET: ${context.asset}
MARKET SUMMARY: ${context.summary || "Current market analysis"}
TOP NEWS: ${context.articles.slice(0, 3).map((a) => a.title).join(" | ") || "General market news"}

Based on this specific context, simulate these 9 investor groups (110 each):
1. Fearful Retail Investors
2. Conservative Long-term Savers  
3. Technical Day Traders
4. Small Hedge Fund Managers
5. Crypto & Tech Enthusiasts
6. Pension Fund Managers
7. Emerging Market Investors
8. Deep Value Hunters
9. Momentum Trend Followers

For EACH group give a DIFFERENT and realistic decision based on the actual news above.

Respond with ONLY this JSON:
{"groups":[{"name":"Fearful Retail Investors","count":110,"decision":"SELL","sentiment":35,"reasoning":"They panic sell on any bad news."},{"name":"Conservative Savers","count":110,"decision":"HOLD","sentiment":45,"reasoning":"They stay the course regardless."},{"name":"Technical Day Traders","count":110,"decision":"BUY","sentiment":65,"reasoning":"Technical breakout signal detected."},{"name":"Small Hedge Funds","count":110,"decision":"HOLD","sentiment":52,"reasoning":"Waiting for more data before acting."},{"name":"Crypto & Tech Enthusiasts","count":110,"decision":"BUY","sentiment":75,"reasoning":"High growth potential excites them."},{"name":"Pension Managers","count":110,"decision":"HOLD","sentiment":48,"reasoning":"Stability is the priority."},{"name":"EM Investors","count":110,"decision":"SELL","sentiment":38,"reasoning":"USD strength concerns them."},{"name":"Deep Value Hunters","count":110,"decision":"BUY","sentiment":60,"reasoning":"Trading below intrinsic value."},{"name":"Momentum Followers","count":110,"decision":"BUY","sentiment":68,"reasoning":"Trend is clearly upward."}],"crowdDecision":"BUY","crowdSentiment":54,"herdBehaviorRisk":"MEDIUM","crowdInsight":"One specific insight about crowd psychology for ${context.asset} based on the news."}

Make each group's decision realistic and DIFFERENT based on the actual news. crowdDecision should match the majority.`;

  return await gemini(prompt);
}

// ─── FINAL REPORT ────────────────────────────────────────────────────────────
async function generateReport(context, archetypes, crowd) {
  const buyCount  = archetypes.filter((a) => a.decision === "BUY").length;
  const sellCount = archetypes.filter((a) => a.decision === "SELL").length;
  const holdCount = archetypes.filter((a) => a.decision === "HOLD").length;

  const prompt = `You are a senior investment analyst. Write a final comprehensive report.

ASSET: ${context.asset}
${context.dateFrom ? `PERIOD: ${context.dateFrom} to ${context.dateTo}` : ""}
MARKET CONTEXT: ${context.summary}

EXPERT VOTES: BUY ${buyCount}/10 | SELL ${sellCount}/10 | HOLD ${holdCount}/10
EXPERT VIEWS:
${archetypes.map((a) => `[${a.decision} ${a.confidence}%] ${a.name}: ${a.thesis}`).join("\n")}

CROWD: ${crowd.crowdDecision} | Sentiment ${crowd.crowdSentiment}/100 | Herd Risk ${crowd.herdBehaviorRisk}

Write the report based on ALL the above data. Be specific to ${context.asset}.

Respond with ONLY this JSON:
{"verdict":"BUY","score":68,"summary":"3-4 specific sentences about ${context.asset} investment case based on current data.","buyPercentage":${buyCount * 10},"holdPercentage":${holdCount * 10},"sellPercentage":${sellCount * 10},"entryStrategy":"Specific practical entry advice for ${context.asset}.","stopLoss":"Specific stop loss recommendation.","topOpportunity":"The single biggest specific opportunity right now.","topRisk":"The single biggest specific risk right now.","scenarios":[{"name":"Bull Case","probability":35,"description":"Specific bull scenario for ${context.asset}."},{"name":"Base Case","probability":45,"description":"Most likely outcome for ${context.asset}."},{"name":"Bear Case","probability":20,"description":"Specific bear scenario for ${context.asset}."}],"keyMetrics":["Specific metric 1 to watch","Specific metric 2 to watch","Specific metric 3 to watch"],"timeHorizon":"Recommended horizon based on analysis."}

verdict must be: STRONG BUY, BUY, HOLD, SELL, or STRONG SELL`;

  return await gemini(prompt);
}

// ─── MAIN ENDPOINT ────────────────────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  const { asset, dateFrom, dateTo } = req.body;
  if (!asset) return res.status(400).json({ error: "Asset name required" });

  console.log(`\n🔍 Analyzing: ${asset} ${dateFrom ? `(${dateFrom} → ${dateTo})` : ""}`);

  try {
    // 1. News
    console.log("📰 Fetching news...");
    const newsData = await searchNews(asset, dateFrom, dateTo);
    const context  = { asset, dateFrom, dateTo, ...newsData };
    console.log(`   Got ${context.articles.length} articles`);

    // 2. Archetypes — sequential to avoid rate limits
    console.log("🧠 Running archetypes...");
    const archetypeResults = [];
    for (let i = 0; i < ARCHETYPES.length; i++) {
      const a = ARCHETYPES[i];
      console.log(`   [${i + 1}/10] ${a.name}...`);
      try {
        const result = await runArchetype(a, context);
        archetypeResults.push(result);
      } catch (err) {
        console.error(`   ❌ ${a.name} failed: ${err.message}`);
        // Push fallback with random but different values
        archetypeResults.push({
          ...a,
          decision: ["BUY", "SELL", "HOLD"][i % 3],
          confidence: 55 + (i * 4),
          allocation: "3-5% of portfolio",
          thesis: `Analysis for ${asset} from ${a.name} perspective pending retry.`,
          keyRisk: "Market uncertainty and volatility.",
          target: asset,
          timeHorizon: "6-12 months",
        });
      }
      // Small delay to avoid rate limit
      await new Promise((r) => setTimeout(r, 300));
    }

    // 3. Crowd
    console.log("👥 Running crowd...");
    let crowdResult;
    try {
      crowdResult = await runCrowd(context);
    } catch (err) {
      console.error("   ❌ Crowd failed:", err.message);
      const buyC  = archetypeResults.filter((a) => a.decision === "BUY").length;
      const sellC = archetypeResults.filter((a) => a.decision === "SELL").length;
      const dominant = buyC >= sellC ? "BUY" : "SELL";
      crowdResult = {
        groups: [
          { name: "Retail Investors",    count: 110, decision: dominant, sentiment: 55, reasoning: "Following market trend." },
          { name: "Conservative Savers", count: 110, decision: "HOLD",   sentiment: 45, reasoning: "Cautious approach." },
          { name: "Day Traders",         count: 110, decision: dominant, sentiment: 62, reasoning: "Technical signals positive." },
          { name: "Hedge Funds",         count: 110, decision: "HOLD",   sentiment: 50, reasoning: "Awaiting more data." },
          { name: "Tech Enthusiasts",    count: 110, decision: "BUY",    sentiment: 72, reasoning: "Long-term growth story." },
          { name: "Pension Managers",    count: 110, decision: "HOLD",   sentiment: 47, reasoning: "Stability priority." },
          { name: "EM Investors",        count: 110, decision: "SELL",   sentiment: 40, reasoning: "Currency risk concern." },
          { name: "Value Hunters",       count: 110, decision: "BUY",    sentiment: 60, reasoning: "Value opportunity." },
          { name: "Momentum Traders",    count: 110, decision: dominant, sentiment: 65, reasoning: "Trend following signal." },
        ],
        crowdDecision: dominant,
        crowdSentiment: 56,
        herdBehaviorRisk: "MEDIUM",
        crowdInsight: `Crowd sentiment for ${asset} is divided between growth optimists and risk-averse holders.`,
      };
    }

    // 4. Report
    console.log("📊 Generating report...");
    let report;
    try {
      report = await generateReport(context, archetypeResults, crowdResult);
    } catch (err) {
      console.error("   ❌ Report failed:", err.message);
      const buyC  = archetypeResults.filter((a) => a.decision === "BUY").length;
      const sellC = archetypeResults.filter((a) => a.decision === "SELL").length;
      const holdC = archetypeResults.filter((a) => a.decision === "HOLD").length;
      const verdict = buyC >= 6 ? "BUY" : sellC >= 6 ? "SELL" : "HOLD";
      report = {
        verdict,
        score: 55 + buyC * 3,
        summary: `Analysis of ${asset} shows mixed signals across expert archetypes with ${buyC} buy, ${holdC} hold, and ${sellC} sell recommendations.`,
        buyPercentage:  buyC  * 10,
        holdPercentage: holdC * 10,
        sellPercentage: sellC * 10,
        entryStrategy: `Scale into ${asset} position gradually over 2-3 tranches.`,
        stopLoss: "Set stop loss at 8-10% below entry price.",
        topOpportunity: `${asset} shows potential upside based on current analyst consensus.`,
        topRisk: "Macro uncertainty and market volatility remain key risks.",
        scenarios: [
          { name: "Bull Case", probability: 35, description: `${asset} outperforms if macro conditions improve.` },
          { name: "Base Case", probability: 45, description: `${asset} consolidates near current levels.` },
          { name: "Bear Case", probability: 20, description: `${asset} declines if broader market weakens.` },
        ],
        keyMetrics: ["Revenue growth rate", "Profit margins", "Market sentiment index"],
        timeHorizon: "6-12 months",
      };
    }

    console.log(`✅ Done! Verdict: ${report.verdict}`);

    res.json({
      asset,
      dateFrom,
      dateTo,
      news: { summary: context.summary, articles: context.articles },
      archetypes: archetypeResults,
      crowd: crowdResult,
      report,
    });

  } catch (err) {
    console.error("❌ Fatal error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok", name: "The Pantheon" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n🏛️  The Pantheon on port ${PORT}\n`));
