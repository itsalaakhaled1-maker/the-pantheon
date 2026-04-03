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

// ─── AGENTS DEFINITION ───────────────────────────────────────────────────────
const STAR_AGENTS = [
  { name: "Warren Buffett", role: "Value investor. Looks for long-term moats, brand strength, consistent earnings. Avoids speculation.", emoji: "🏦" },
  { name: "George Soros", role: "Macro trader. Focuses on global trends, reflexivity, and market psychology. Bold contrarian.", emoji: "🌍" },
  { name: "Michael Burry", role: "Deep value. Hunts for hidden risks the market ignores. Skeptical, data-driven, contrarian.", emoji: "🔍" },
  { name: "Cathie Wood", role: "Disruptive innovation investor. Loves exponential tech growth, AI, genomics, future industries.", emoji: "🚀" },
  { name: "Ray Dalio", role: "Macro systematic thinker. Analyzes debt cycles, economic machines, diversification principles.", emoji: "⚖️" },
  { name: "Goldman Sachs Desk", role: "Institutional analysis. Quantitative models, earnings forecasts, sector rotation, risk metrics.", emoji: "📊" },
  { name: "JP Morgan Research", role: "Global markets perspective. Credit risk, geopolitical factors, liquidity analysis.", emoji: "🏛️" },
  { name: "Peter Lynch", role: "Growth at reasonable price. Focuses on business fundamentals, management quality, consumer insight.", emoji: "📈" },
  { name: "Nassim Taleb", role: "Black swan risk analyst. Questions assumptions, finds hidden fragilities and tail risks.", emoji: "🎲" },
  { name: "Stanley Druckenmiller", role: "Momentum and macro. Tracks liquidity flows, earnings momentum, and central bank policy.", emoji: "💰" },
];

// ─── SEARCH NEWS ─────────────────────────────────────────────────────────────
async function searchNews(query) {
  try {
    const res = await axios.post("https://api.tavily.com/search", {
      api_key: TAVILY_KEY,
      query: `${query} stock investment news analysis 2024 2025`,
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

// ─── STAR AGENT ANALYSIS ─────────────────────────────────────────────────────
async function runStarAgent(agent, asset, newsContext) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt = `
You are ${agent.name}. ${agent.role}

Asset under analysis: ${asset}

Latest news and market context:
${newsContext}

Provide your personal investment analysis as ${agent.name}. Be direct, specific, and in character.
Respond in this exact JSON format:
{
  "sentiment": "BULLISH" or "BEARISH" or "NEUTRAL",
  "confidence": number between 0-100,
  "verdict": "BUY" or "SELL" or "HOLD",
  "allocation": number between 0-100 (suggested % of portfolio),
  "reasoning": "2-3 sentences in your unique style and philosophy",
  "key_risk": "The single biggest risk you see",
  "key_opportunity": "The single biggest opportunity you see"
}
Return ONLY valid JSON, no markdown, no explanation.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    return { agent: agent.name, emoji: agent.emoji, ...JSON.parse(text) };
  } catch (err) {
    return {
      agent: agent.name,
      emoji: agent.emoji,
      sentiment: "NEUTRAL",
      confidence: 50,
      verdict: "HOLD",
      allocation: 5,
      reasoning: "Analysis unavailable at this time.",
      key_risk: "Unknown",
      key_opportunity: "Unknown",
    };
  }
}

// ─── CROWD SIMULATION (990 agents in 10 calls) ────────────────────────────────
async function runCrowdBatch(batchType, asset, newsContext) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const batchDescriptions = {
    retail_fearful: "100 retail investors who are risk-averse, mostly beginners, worried about losing money",
    retail_greedy: "100 retail investors who are aggressive, chasing returns, influenced by social media hype",
    institutional_small: "100 small institutional fund managers with 5-15 years experience",
    crypto_traders: "100 crypto-native traders who compare everything to crypto cycles",
    conservative_savers: "100 conservative savers and retirees protecting their wealth",
    emerging_market: "100 investors from emerging markets (Middle East, Asia, Africa)",
    quant_traders: "100 quantitative algorithmic traders focused purely on data signals",
    esg_investors: "100 ESG and socially responsible investors",
    day_traders: "100 active day traders focused on short-term momentum",
    value_hunters: "100 deep value investors looking for undervalued opportunities",
  };

  const prompt = `
Simulate the collective investment sentiment of: ${batchDescriptions[batchType]}

Asset: ${asset}
Market context: ${newsContext.substring(0, 500)}

Respond ONLY in this exact JSON:
{
  "buy_percent": number 0-100,
  "sell_percent": number 0-100,
  "hold_percent": number 0-100,
  "avg_confidence": number 0-100,
  "dominant_emotion": "one word: Fear/Greed/Optimism/Caution/Excitement/Uncertainty"
}
Numbers must sum to 100. Return ONLY valid JSON.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    const data = JSON.parse(text);
    return { batch: batchType, count: 100, ...data };
  } catch {
    return { batch: batchType, count: 100, buy_percent: 33, sell_percent: 33, hold_percent: 34, avg_confidence: 50, dominant_emotion: "Uncertainty" };
  }
}

// ─── FINAL SYNTHESIS ─────────────────────────────────────────────────────────
async function synthesizeFinal(asset, starResults, crowdData, newsContext) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const starSummary = starResults.map(r => `${r.agent}: ${r.verdict} (${r.confidence}% confidence) — ${r.reasoning}`).join("\n");
  const crowdBuy = Math.round(crowdData.reduce((s, c) => s + c.buy_percent, 0) / crowdData.length);
  const crowdSell = Math.round(crowdData.reduce((s, c) => s + c.sell_percent, 0) / crowdData.length);

  const prompt = `
You are The Pantheon — the world's most sophisticated AI investment council.
You have just received analysis from 10 legendary investors and 990 crowd participants about: ${asset}

STAR INVESTORS VERDICT:
${starSummary}

CROWD OF 990 VERDICT:
Buy: ${crowdBuy}% | Sell: ${crowdSell}% | Hold: ${100 - crowdBuy - crowdSell}%

NEWS CONTEXT:
${newsContext.substring(0, 800)}

Synthesize everything into a final Pantheon verdict. Respond in this exact JSON:
{
  "overall_verdict": "BUY" or "SELL" or "HOLD",
  "conviction": "HIGH" or "MEDIUM" or "LOW",
  "buy_allocation": number 0-100,
  "hold_allocation": number 0-100,
  "sell_allocation": number 0-100,
  "executive_summary": "3-4 sentence powerful synthesis of the situation",
  "bull_case": "Best case scenario if things go right",
  "bear_case": "Worst case scenario if things go wrong",
  "time_horizon": "SHORT (days-weeks) or MEDIUM (months) or LONG (years)",
  "entry_strategy": "Practical advice on HOW to enter/exit",
  "key_metrics_to_watch": ["metric1", "metric2", "metric3"],
  "risk_level": "LOW" or "MEDIUM" or "HIGH" or "EXTREME"
}
Return ONLY valid JSON.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    return JSON.parse(text);
  } catch {
    return {
      overall_verdict: "HOLD",
      conviction: "LOW",
      buy_allocation: 33,
      hold_allocation: 34,
      sell_allocation: 33,
      executive_summary: "Analysis inconclusive. Please try again.",
      bull_case: "N/A",
      bear_case: "N/A",
      time_horizon: "MEDIUM",
      entry_strategy: "Wait for clearer signals.",
      key_metrics_to_watch: ["Price action", "Volume", "News flow"],
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

  // Keep-alive ping every 15 seconds
  const keepAlive = setInterval(() => {
    res.write(`: ping\n\n`);
    if (res.flush) res.flush();
  }, 15000);

  try {
    // Step 1: Search news
    send({ step: "search", message: `🔍 جاري البحث عن آخر أخبار ${asset}...`, progress: 5 });
    const newsData = await searchNews(asset);
    const newsContext = newsData.answer
      ? newsData.answer + "\n\n" + newsData.results.map((r) => `${r.title}: ${r.content?.substring(0, 200)}`).join("\n")
      : newsData.results.map((r) => `${r.title}: ${r.content?.substring(0, 200)}`).join("\n");

    send({ step: "news_ready", message: `📰 تم جلب ${newsData.results.length} مصدر إخباري`, progress: 15 });

    // Step 2: Star agents — all fire at once, report as each finishes
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

    // Step 3: Crowd simulation
    send({ step: "crowd_start", message: "👥 محاكاة 990 مستثمر...", progress: 62 });
    const batchTypes = Object.keys({
      retail_fearful: 1, retail_greedy: 1, institutional_small: 1,
      crypto_traders: 1, conservative_savers: 1, emerging_market: 1,
      quant_traders: 1, esg_investors: 1, day_traders: 1, value_hunters: 1,
    });

    const crowdResults = await Promise.all(batchTypes.map((b) => runCrowdBatch(b, asset, newsContext)));
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
app.listen(PORT, () => console.log(`The Pantheon running on port ${PORT}`));
