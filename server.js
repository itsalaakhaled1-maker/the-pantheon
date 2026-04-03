require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const TAVILY_KEY = process.env.TAVILY_API_KEY;

// ─── HELPER: Get Gemini model with JSON mode forced ───────────────────────────
function getModel() {
  return genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
    },
  });
}

// ─── HELPER: Safe JSON parse with fallback extraction ────────────────────────
function safeJSON(text) {
  // Try direct parse
  try { return JSON.parse(text); } catch {}
  // Try extract first { } block
  const match = text.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

// ─── AGENTS DEFINITION ───────────────────────────────────────────────────────
const STAR_AGENTS = [
  { name: "Warren Buffett",       role: "Value investor. Long-term moats, brand strength, consistent earnings. Avoids speculation.",           emoji: "🏦" },
  { name: "George Soros",         role: "Macro trader. Global trends, reflexivity, market psychology. Bold contrarian.",                       emoji: "🌍" },
  { name: "Michael Burry",        role: "Deep value. Hunts hidden risks the market ignores. Skeptical, data-driven, contrarian.",               emoji: "🔍" },
  { name: "Cathie Wood",          role: "Disruptive innovation. Exponential tech growth, AI, genomics, future industries.",                     emoji: "🚀" },
  { name: "Ray Dalio",            role: "Macro systematic. Debt cycles, economic machines, diversification principles.",                        emoji: "⚖️" },
  { name: "Goldman Sachs Desk",   role: "Institutional analysis. Quantitative models, earnings forecasts, sector rotation.",                    emoji: "📊" },
  { name: "JP Morgan Research",   role: "Global markets. Credit risk, geopolitical factors, liquidity analysis.",                              emoji: "🏛️" },
  { name: "Peter Lynch",          role: "Growth at reasonable price. Business fundamentals, management quality, consumer insight.",             emoji: "📈" },
  { name: "Nassim Taleb",         role: "Black swan risk analyst. Questions assumptions, finds hidden fragilities and tail risks.",             emoji: "🎲" },
  { name: "Stanley Druckenmiller",role: "Momentum and macro. Liquidity flows, earnings momentum, central bank policy.",                        emoji: "💰" },
];

// ─── SEARCH NEWS ─────────────────────────────────────────────────────────────
async function searchNews(query) {
  try {
    const res = await axios.post("https://api.tavily.com/search", {
      api_key: TAVILY_KEY,
      query: `${query} stock investment news analysis 2025`,
      search_depth: "advanced",
      max_results: 8,
      include_answer: true,
    });
    return res.data;
  } catch (err) {
    console.error("Tavily error:", err.message);
    return { results: [], answer: "" };
  }
}

// ─── STAR AGENT ───────────────────────────────────────────────────────────────
async function runStarAgent(agent, asset, newsContext) {
  const model = getModel();
  const prompt = `You are ${agent.name}. ${agent.role}

Asset: ${asset}
News context: ${newsContext.substring(0, 600)}

Respond as ${agent.name} with your personal investment analysis. Return this exact JSON object:
{
  "sentiment": "BULLISH",
  "confidence": 72,
  "verdict": "BUY",
  "allocation": 15,
  "reasoning": "Your 2-3 sentence analysis in your unique voice and philosophy.",
  "key_risk": "The single biggest risk you see for this asset right now.",
  "key_opportunity": "The single biggest opportunity you see for this asset right now."
}
verdict must be BUY, SELL, or HOLD. confidence and allocation are numbers 0-100.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log(`Agent ${agent.name} raw:`, text.substring(0, 100));
    const parsed = safeJSON(text);
    if (!parsed || !parsed.verdict) throw new Error("bad JSON");
    return { agent: agent.name, emoji: agent.emoji, ...parsed };
  } catch (err) {
    console.error(`Agent ${agent.name} failed:`, err.message);
    return {
      agent: agent.name, emoji: agent.emoji,
      sentiment: "NEUTRAL", confidence: 50, verdict: "HOLD", allocation: 5,
      reasoning: "تعذّر الحصول على التحليل في الوقت الحالي.",
      key_risk: "غير محدد", key_opportunity: "غير محدد",
    };
  }
}

// ─── CROWD BATCH ─────────────────────────────────────────────────────────────
const BATCH_DESCRIPTIONS = {
  retail_fearful:     "100 retail investors who are risk-averse beginners, worried about losing money",
  retail_greedy:      "100 aggressive retail investors chasing returns, influenced by social media hype",
  institutional_small:"100 small institutional fund managers with 5-15 years experience",
  crypto_traders:     "100 crypto-native traders who compare everything to crypto cycles",
  conservative_savers:"100 conservative savers and retirees protecting their wealth",
  emerging_market:    "100 investors from emerging markets (Middle East, Asia, Africa)",
  quant_traders:      "100 quantitative algorithmic traders focused purely on data signals",
  esg_investors:      "100 ESG and socially responsible investors",
  day_traders:        "100 active day traders focused on short-term price momentum",
  value_hunters:      "100 deep value investors looking for undervalued opportunities",
};

async function runCrowdBatch(batchType, asset, newsContext) {
  const model = getModel();
  const prompt = `Simulate the collective investment sentiment of: ${BATCH_DESCRIPTIONS[batchType]}

Asset: ${asset}
Market context: ${newsContext.substring(0, 400)}

Return this exact JSON (buy_percent + sell_percent + hold_percent must equal 100):
{
  "buy_percent": 45,
  "sell_percent": 25,
  "hold_percent": 30,
  "avg_confidence": 62,
  "dominant_emotion": "Optimism"
}
dominant_emotion must be one word: Fear, Greed, Optimism, Caution, Excitement, or Uncertainty.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = safeJSON(text);
    if (!parsed || parsed.buy_percent === undefined) throw new Error("bad JSON");
    // Normalize to 100
    const total = parsed.buy_percent + parsed.sell_percent + parsed.hold_percent;
    if (total !== 100) {
      parsed.hold_percent += (100 - total);
    }
    return { batch: batchType, count: 100, ...parsed };
  } catch (err) {
    console.error(`Crowd batch ${batchType} failed:`, err.message);
    return { batch: batchType, count: 100, buy_percent: 33, sell_percent: 33, hold_percent: 34, avg_confidence: 50, dominant_emotion: "Uncertainty" };
  }
}

// ─── FINAL SYNTHESIS ─────────────────────────────────────────────────────────
async function synthesizeFinal(asset, starResults, crowdData, newsContext) {
  const model = getModel();

  const starSummary = starResults
    .map(r => `${r.agent}: ${r.verdict} (confidence ${r.confidence}%) — ${r.reasoning}`)
    .join("\n");

  const avgBuy  = Math.round(crowdData.reduce((s, c) => s + c.buy_percent, 0)  / crowdData.length);
  const avgSell = Math.round(crowdData.reduce((s, c) => s + c.sell_percent, 0) / crowdData.length);
  const avgHold = 100 - avgBuy - avgSell;

  const buyVotes  = starResults.filter(r => r.verdict === "BUY").length;
  const sellVotes = starResults.filter(r => r.verdict === "SELL").length;

  const prompt = `You are The Pantheon — the world's most sophisticated AI investment council.
Analysis complete for: ${asset}

EXPERT PANEL (10 legendary investors):
${starSummary}

CROWD SENTIMENT (990 investors):
Buy: ${avgBuy}% | Sell: ${avgSell}% | Hold: ${avgHold}%
Expert votes: ${buyVotes} BUY, ${sellVotes} SELL, ${10-buyVotes-sellVotes} HOLD

NEWS CONTEXT:
${newsContext.substring(0, 600)}

Synthesize all signals into a definitive Pantheon verdict. Return this exact JSON:
{
  "overall_verdict": "BUY",
  "conviction": "HIGH",
  "buy_allocation": 60,
  "hold_allocation": 30,
  "sell_allocation": 10,
  "executive_summary": "3-4 sentences synthesizing the overall picture for ${asset} right now.",
  "bull_case": "Specific best-case scenario if things go right for ${asset}.",
  "bear_case": "Specific worst-case scenario and main downside risks for ${asset}.",
  "time_horizon": "MEDIUM",
  "entry_strategy": "Practical step-by-step advice on how to enter or exit this position.",
  "key_metrics_to_watch": ["Metric 1", "Metric 2", "Metric 3"],
  "risk_level": "MEDIUM"
}
overall_verdict: BUY, SELL, or HOLD. conviction: HIGH, MEDIUM, or LOW. time_horizon: SHORT, MEDIUM, or LONG. risk_level: LOW, MEDIUM, HIGH, or EXTREME. Allocations must sum to 100.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log("Synthesis raw:", text.substring(0, 150));
    const parsed = safeJSON(text);
    if (!parsed || !parsed.overall_verdict) throw new Error("bad JSON");
    return parsed;
  } catch (err) {
    console.error("Synthesis failed:", err.message);
    // Build a reasonable fallback from star votes
    const verdict = buyVotes >= 6 ? "BUY" : buyVotes <= 3 ? "SELL" : "HOLD";
    return {
      overall_verdict: verdict,
      conviction: "MEDIUM",
      buy_allocation: buyVotes * 8,
      hold_allocation: 40,
      sell_allocation: 100 - buyVotes * 8 - 40,
      executive_summary: `تحليل ${asset} يشير إلى توجه ${verdict === "BUY" ? "إيجابي" : verdict === "SELL" ? "سلبي" : "محايد"} بناءً على آراء الخبراء.`,
      bull_case: "نمو مستمر مع تحسن المؤشرات الاقتصادية.",
      bear_case: "تصحيح محتمل في حال تغيرت ظروف السوق.",
      time_horizon: "MEDIUM",
      entry_strategy: "ادخل على مراحل وضع حدوداً للخسارة.",
      key_metrics_to_watch: ["حركة السعر", "حجم التداول", "الأخبار الاقتصادية"],
      risk_level: "MEDIUM",
    };
  }
}

// ─── MAIN ANALYSIS ENDPOINT ───────────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  const { asset } = req.body;
  if (!asset) return res.status(400).json({ error: "Asset name required" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();
  };

  const keepAlive = setInterval(() => {
    res.write(`: ping\n\n`);
    if (res.flush) res.flush();
  }, 15000);

  try {
    // Step 1: News
    send({ step: "search", message: `🔍 جاري البحث عن آخر أخبار ${asset}...`, progress: 5 });
    const newsData = await searchNews(asset);
    const newsContext = [
      newsData.answer || "",
      ...newsData.results.map(r => `${r.title}: ${(r.content || "").substring(0, 200)}`),
    ].filter(Boolean).join("\n");

    send({ step: "news_ready", message: `📰 تم جلب ${newsData.results.length} مصدر إخباري`, progress: 15 });

    // Step 2: Star agents — all in parallel, report as each finishes
    send({ step: "agents_start", message: "🏛️ الـ 10 خبراء يحللون الآن...", progress: 20 });
    const starResults = [];
    let agentsDone = 0;

    await Promise.all(
      STAR_AGENTS.map(async (agent) => {
        const result = await runStarAgent(agent, asset, newsContext);
        starResults.push(result);
        agentsDone++;
        send({
          step: "agent_done",
          agent: result,
          message: `${result.emoji} ${result.agent}: ${result.verdict}`,
          progress: 20 + agentsDone * 4,
        });
      })
    );

    // Step 3: Crowd (all parallel)
    send({ step: "crowd_start", message: "👥 محاكاة 990 مستثمر...", progress: 62 });
    const crowdResults = await Promise.all(
      Object.keys(BATCH_DESCRIPTIONS).map(b => runCrowdBatch(b, asset, newsContext))
    );
    send({ step: "crowd_done", crowd: crowdResults, message: "✅ تم تحليل 990 مستثمر", progress: 80 });

    // Step 4: Final synthesis
    send({ step: "synthesis_start", message: "⚡ The Pantheon يصدر الحكم النهائي...", progress: 85 });
    const finalVerdict = await synthesizeFinal(asset, starResults, crowdResults, newsContext);

    send({
      step: "complete",
      message: "✅ التحليل اكتمل",
      progress: 100,
      data: {
        asset,
        news: newsData.results.slice(0, 5),
        starAgents: starResults,
        crowd: crowdResults,
        verdict: finalVerdict,
      },
    });

  } catch (err) {
    console.error("Main error:", err);
    send({ step: "error", message: err.message });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🏛️ The Pantheon running on port ${PORT}`));
