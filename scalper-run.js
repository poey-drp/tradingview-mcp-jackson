import { createHmac } from "crypto";
import https from "https";
import { existsSync, readFileSync, writeFileSync } from "fs";

// Load .env if it exists
if (existsSync(new URL(".env", import.meta.url))) {
  readFileSync(new URL(".env", import.meta.url), "utf8")
    .split("\n")
    .forEach((line) => {
      const [k, ...v] = line.split("=");
      if (k && !k.startsWith("#") && v.length)
        process.env[k.trim()] = v.join("=").trim();
    });
}

const API_KEY = process.env.BITGET_API_KEY;
const SECRET_KEY = process.env.BITGET_SECRET_KEY;
const PASSPHRASE = process.env.BITGET_PASSPHRASE;

const SYMBOL = "XRPUSDT"; // XRP/USDT spot
const INTERVAL_MS = 10000; // 10 seconds
const TOTAL_TRADES = 6;

// ── DRY RUN (Simulation) state ──────────────────────────────────
const IS_DRY_RUN = !API_KEY || !SECRET_KEY || !PASSPHRASE;
let mockUSDT = 100.0;
let mockXRP = 0.0;
let mockLastPrice = 0.5200;

if (IS_DRY_RUN) {
  console.log("⚠️  BitGet API credentials not fully configured in .env.");
  console.log("⚠️  Running in SIMULATION (DRY-RUN) mode with mock data and assets.");
} else {
  console.log("🚀 Running in LIVE mode connecting to BitGet API.");
}

// ── Mock request handler ─────────────────────────────────────────
function mockRequest(method, path, body) {
  return new Promise((resolve) => {
    setTimeout(() => {
      // 1. Candles endpoint
      if (path.includes("/api/v2/spot/market/candles")) {
        const urlParams = new URLSearchParams(path.split("?")[1]);
        const limit = parseInt(urlParams.get("limit") || "30");
        
        // Generate mock price trend (slightly upward sine wave + random noise)
        const mockCandles = [];
        let basePrice = mockLastPrice;
        let now = Date.now();
        
        for (let i = 0; i < limit; i++) {
          const t = i / 10;
          const sineOffset = Math.sin(t) * 0.005;
          const noise = (Math.random() - 0.5) * 0.002;
          const close = basePrice + sineOffset + noise;
          const open = close - (Math.random() - 0.5) * 0.002;
          const high = Math.max(open, close) + Math.random() * 0.001;
          const low = Math.min(open, close) - Math.random() * 0.001;
          const vol = 1000 + Math.random() * 5000;
          
          mockCandles.push([
            (now - i * 60000).toString(), // 1 min interval
            open.toFixed(4),
            high.toFixed(4),
            low.toFixed(4),
            close.toFixed(4),
            vol.toFixed(2)
          ]);
        }
        
        // Return latest first (BitGet default is descending order)
        resolve({ code: "00000", data: mockCandles });
        return;
      }
      
      // 2. Tickers endpoint
      if (path.includes("/api/v2/spot/market/tickers")) {
        // Fluctuate price slightly
        mockLastPrice += (Math.random() - 0.5) * 0.001;
        resolve({
          code: "00000",
          data: [{ symbol: SYMBOL, lastPr: mockLastPrice.toFixed(4) }]
        });
        return;
      }
      
      // 3. Assets endpoint
      if (path.includes("/api/v2/spot/account/assets")) {
        resolve({
          code: "00000",
          data: [
            { coin: "USDT", available: mockUSDT.toFixed(4) },
            { coin: "XRP", available: mockXRP.toFixed(4) }
          ]
        });
        return;
      }
      
      // 4. Place order endpoint
      if (path.includes("/api/v2/spot/trade/place-order")) {
        const orderId = "mock-order-" + Math.floor(Math.random() * 1000000);
        const size = parseFloat(body.size);
        
        if (body.side === "buy") {
          // Spent size USDT
          mockUSDT -= size;
          const receivedXRP = size / mockLastPrice;
          mockXRP += receivedXRP;
          resolve({
            code: "00000",
            msg: "success",
            data: { orderId, size: size.toString(), baseVolume: receivedXRP.toFixed(4) }
          });
        } else {
          // Sell size XRP
          mockXRP -= size;
          const receivedUSDT = size * mockLastPrice;
          mockUSDT += receivedUSDT;
          resolve({
            code: "00000",
            msg: "success",
            data: { orderId, size: size.toString(), baseVolume: size.toFixed(4) }
          });
        }
        return;
      }
      
      // 5. Order info endpoint
      if (path.includes("/api/v2/spot/trade/orderInfo")) {
        resolve({
          code: "00000",
          data: {
            baseVolume: mockXRP.toFixed(4)
          }
        });
        return;
      }
      
      resolve({ code: "00000", data: {} });
    }, 100);
  });
}

// ── BitGet helpers ──────────────────────────────────────────────
function sign(ts, method, path, body = "") {
  return createHmac("sha256", SECRET_KEY)
    .update(ts + method + path + body)
    .digest("base64");
}

function request(method, path, body = null) {
  if (IS_DRY_RUN) {
    return mockRequest(method, path, body);
  }
  
  return new Promise((resolve, reject) => {
    const ts = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body) : "";
    const sig = sign(ts, method, path, bodyStr);
    const req = https.request(
      {
        hostname: "api.bitget.com",
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          "ACCESS-KEY": API_KEY,
          "ACCESS-SIGN": sig,
          "ACCESS-TIMESTAMP": ts,
          "ACCESS-PASSPHRASE": PASSPHRASE,
          locale: "en-US",
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(JSON.parse(d)));
      },
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Market data ─────────────────────────────────────────────────
async function getCandles(symbol, limit = 30) {
  const res = await request(
    "GET",
    `/api/v2/spot/market/candles?symbol=${symbol}&granularity=1min&limit=${limit}`,
  );
  return (res.data || []).map((c) => ({
    ts: parseInt(c[0]),
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    vol: parseFloat(c[5]),
  }));
}

async function getPrice(symbol) {
  const res = await request(
    "GET",
    `/api/v2/spot/market/tickers?symbol=${symbol}`,
  );
  return parseFloat(res.data?.[0]?.lastPr || 0);
}

async function getBalances() {
  const res = await request("GET", "/api/v2/spot/account/assets");
  const usdt = res.data?.find((a) => a.coin === "USDT");
  const xrp = res.data?.find((a) => a.coin === "XRP");
  return {
    usdt: parseFloat(usdt?.available || 0),
    xrp: parseFloat(xrp?.available || 0),
  };
}

// ── Indicators ──────────────────────────────────────────────────
function calcEMA(closes, period) {
  if (closes.length === 0) return 0;
  // Not enough data for a full period — fall back to simple average of what we have
  if (closes.length < period) {
    return closes.reduce((a, b) => a + b, 0) / closes.length;
  }
  const k = 2 / (period + 1);
  // Seed with the SMA of the first `period` closes so the EMA stabilises quickly
  // instead of being skewed by a single early value.
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

// Wilder's Smoothed RSI calculation to reduce noise and signals
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  
  let gains = [];
  let losses = [];
  
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcVWAP(candles) {
  let cumTPV = 0,
    cumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.vol;
    cumVol += c.vol;
  }
  return cumVol === 0 ? candles[candles.length - 1].close : cumTPV / cumVol;
}

// ── Signal logic (mirrors Pine Script) ─────────────────────────
function getSignal(candles) {
  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1]; // This is now correct since we reverse the candles!

  const ema8 = calcEMA(closes, 8);
  const ema200 = calcEMA(closes, 200); // 200-period EMA for trend filter
  const rsi3 = calcRSI(closes, 3);     // Wilder's RSI(3)
  const vwap = calcVWAP(candles);

  const bullBias = last > vwap && last > ema8;
  const bearBias = last < vwap && last < ema8;
  const isUpTrend = last > ema200; // Macro trend filter

  let signal = "flat";
  // ENTRY (buy): gated by the macro uptrend to avoid buying into a downtrend.
  if (bullBias && rsi3 < 30 && isUpTrend) signal = "buy";
  // EXIT (sell): mean-reversion exit on overbought. NOT gated by the trend —
  // otherwise a position opened in an uptrend could never be closed by signal
  // and would rely solely on TP/SL. TP/SL still acts as the safety net on top.
  else if (bearBias && rsi3 > 70) signal = "sell";

  return { signal, last, ema8, ema200, rsi3, vwap, isUpTrend };
}

// ── Order helpers ───────────────────────────────────────────────
async function placeOrder(side, size) {
  const body = {
    symbol: SYMBOL,
    side,
    orderType: "market",
    force: "gtc",
    size,
  };
  return request("POST", "/api/v2/spot/trade/place-order", body);
}

async function getOrderFill(orderId) {
  if (IS_DRY_RUN) return mockXRP;
  
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await request(
      "GET",
      `/api/v2/spot/trade/orderInfo?orderId=${orderId}&symbol=${SYMBOL}`,
    );
    const fill = parseFloat(res.data?.baseVolume || 0);
    if (fill > 0) return fill;
  }
  return 0;
}

async function placeSellWithRetry(qty, maxRetries = 12, retryDelayMs = 3000) {
  if (IS_DRY_RUN) {
    const size = (Math.floor(qty * 10000) / 10000).toFixed(4);
    const res = await placeOrder("sell", size);
    return { ok: true, res, soldQty: parseFloat(size) };
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const size = (Math.floor(qty * 10000) / 10000).toFixed(4);
    const res = await placeOrder("sell", size);

    if (res.code === "00000")
      return { ok: true, res, soldQty: parseFloat(size) };

    const lockMatch = res.msg?.match(/([\d.]+)XRP can be used at most/i);
    if (lockMatch) {
      const available = parseFloat(lockMatch[1]);
      console.log(
        `  🔒 Lock active — only ${available} XRP tradeable. Retry ${attempt}/${maxRetries} in ${retryDelayMs / 1000}s...`,
      );
      await new Promise((r) => setTimeout(r, retryDelayMs));
      continue;
    }

    return { ok: false, res, soldQty: 0 };
  }
  return {
    ok: false,
    res: { msg: "Sell lock never lifted after retries" },
    soldQty: 0,
  };
}

// ── Main loop ───────────────────────────────────────────────────
async function main() {
  console.log(`\n🤖 XRP Scalper (Improved) — VWAP + RSI(3) + EMA(8) + Trend Filter`);
  console.log(
    `Symbol: ${SYMBOL} | ${TOTAL_TRADES} trades × ${INTERVAL_MS / 1000}s\n`,
  );

  const log = [];
  let holding = "usdt";
  let lastBuyXrpQty = 0;
  let entryPrice = 0;
  
  const TAKE_PROFIT_PCT = 0.02; // Take Profit at +2%
  const STOP_LOSS_PCT = 0.01;   // Stop Loss at -1%

  for (let i = 1; i <= TOTAL_TRADES; i++) {
    const ts = new Date().toISOString();
    
    // Fetch 231 candles to calculate 200 EMA of closed candles
    const rawCandles = await getCandles(SYMBOL, 231);
    
    // Sort ascending (oldest first) and take closed candles (skip index 230 which is current active candle)
    const candles = rawCandles.reverse().slice(0, 230);
    
    const { signal: rawSignal, last, ema8, ema200, rsi3, vwap } = getSignal(candles);
    const bals = await getBalances();
    
    let signal = rawSignal;

    console.log(`[${i}/${TOTAL_TRADES}] ${ts}`);
    console.log(
      `  Price: $${last.toFixed(4)} | EMA8: ${ema8.toFixed(4)} | EMA200: ${ema200.toFixed(4)} | RSI3: ${rsi3.toFixed(1)} | VWAP: ${vwap.toFixed(4)}`,
    );
    console.log(
      `  USDT: $${bals.usdt.toFixed(4)} | XRP: ${bals.xrp.toFixed(4)}`
    );

    // ── Risk management check (Stop Loss / Take Profit) ───────────
    if (holding === "xrp" && entryPrice > 0) {
      const priceChangePct = (last - entryPrice) / entryPrice;
      console.log(`  Position ROI: ${(priceChangePct * 100).toFixed(2)}%`);
      
      if (priceChangePct >= TAKE_PROFIT_PCT) {
        console.log(`  🎯 Take Profit target reached (+${(TAKE_PROFIT_PCT * 100).toFixed(1)}%)! Overriding signal to SELL.`);
        signal = "sell";
      } else if (priceChangePct <= -STOP_LOSS_PCT) {
        console.log(`  🛑 Stop Loss triggered (-${(STOP_LOSS_PCT * 100).toFixed(1)}%)! Overriding signal to SELL.`);
        signal = "sell";
      }
    }

    console.log(`  Signal: ${signal.toUpperCase()}`);

    let side, size, label;
    const entry = {
      tick: i,
      timestamp: ts,
      price: last,
      ema8,
      ema200,
      rsi3,
      vwap,
      signal,
      orderPlaced: false,
    };

    if (signal === "buy" && holding === "usdt" && bals.usdt >= 1) {
      side = "buy";
      size = (bals.usdt * 0.95).toFixed(4); // Use 95% of available funds
      label = `BUY XRP with $${size} USDT`;
      holding = "xrp";
    } else if (signal === "sell" && holding === "xrp" && lastBuyXrpQty > 0) {
      side = "sell";
      size = (Math.floor(lastBuyXrpQty * 10000) / 10000).toFixed(4);
      label = `SELL ${size} XRP → USDT`;
      holding = "usdt";
    } else {
      const reason =
        signal === "flat"
          ? "no signal — conditions not met"
          : `signal=${signal} but holding=${holding} (waiting for right side)`;
      console.log(`  ⏭  Skip — ${reason}\n`);
      entry.skipped = true;
      entry.skipReason = reason;
      log.push(entry);
      if (i < TOTAL_TRADES)
        await new Promise((r) => setTimeout(r, INTERVAL_MS));
      continue;
    }

    console.log(`  → ${label}`);
    entry.side = side;
    entry.size = size;

    if (side === "buy") {
      const res = await placeOrder("buy", size);
      const ok = res.code === "00000";
      const orderId = res.data?.orderId;
      entry.orderId = orderId || res.msg;
      entry.orderPlaced = ok;

      if (ok) {
        console.log(`  ✅ BUY PLACED — ${orderId}`);
        lastBuyXrpQty = await getOrderFill(orderId);
        entryPrice = last; // Set entry price
        console.log(
          `  📦 Filled: ${lastBuyXrpQty.toFixed(4)} XRP (at $${entryPrice.toFixed(4)}) — waiting for lock to clear...`,
        );
        entry.filledQty = lastBuyXrpQty;
      } else {
        console.log(`  ❌ Rejected: ${res.msg}`);
        holding = "usdt";
      }
    } else {
      const { ok, res, soldQty } = await placeSellWithRetry(lastBuyXrpQty);
      entry.orderId = res.data?.orderId || res.msg;
      entry.orderPlaced = ok;

      if (ok) {
        console.log(
          `  ✅ SELL PLACED — ${entry.orderId} (${soldQty.toFixed(4)} XRP)`
        );
        lastBuyXrpQty = 0;
        entryPrice = 0; // Reset entry price
      } else {
        console.log(`  ❌ Sell failed: ${res.msg}`);
        holding = "xrp";
      }
    }

    log.push(entry);

    if (i < TOTAL_TRADES) {
      const waitMs =
        side === "buy" ? Math.max(INTERVAL_MS - 5000, 4000) : INTERVAL_MS;
      console.log(`  ⏱  Next in ${waitMs / 1000}s...\n`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  const final = await getBalances();
  const price = await getPrice(SYMBOL);
  const totalValue = final.usdt + final.xrp * price;
  console.log(`\n📊 Final:`);
  console.log(`  USDT: $${final.usdt.toFixed(4)}`);
  console.log(
    `  XRP: ${final.xrp.toFixed(4)} (≈$${(final.xrp * price).toFixed(4)})`,
  );
  console.log(`  Total est. value: $${totalValue.toFixed(4)}`);

  const placed = log.filter((e) => e.orderPlaced).length;
  console.log(`\n✅ Done — ${placed}/${TOTAL_TRADES} orders placed.\n`);

  const existing = existsSync("safety-check-log.json")
    ? JSON.parse(readFileSync("safety-check-log.json", "utf8"))
    : [];
  writeFileSync(
    "safety-check-log.json",
    JSON.stringify([...existing, ...log], null, 2),
  );
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
