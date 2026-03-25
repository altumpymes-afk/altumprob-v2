// api/history.js â OHLCV historical data + stats
const https = require('https');

function get(url) {
  return new Promise((res, rej) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://finance.yahoo.com/',
        'Accept': 'application/json',
      },
      timeout: 15000,
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch(e) { rej(e); } });
    });
    req.on('error', rej);
    req.on('timeout', () => { req.destroy(); rej(new Error('Timeout')); });
  });
}

const cache = {};
const TTL = { '1d': 60000, '5d': 120000, '1mo': 300000, '3mo': 600000, '6mo': 900000, '1y': 1800000, '2y': 3600000 };

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { symbol, range = '3mo', interval = '1d' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const key = `${symbol}_${range}_${interval}`;
  const now = Date.now();
  const ttl = TTL[range] || 300000;

  if (cache[key] && now - cache[key].ts < ttl) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache[key].data);
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false&events=div,splits`;
    const data = await get(url);
    const result = data?.chart?.result?.[0];
    if (!result) return res.status(404).json({ error: 'No data', bars: [], stats: {} });

    const ts = result.timestamp || [];
    const q = result.indicators?.quote?.[0] || {};
    const adj = result.indicators?.adjclose?.[0]?.adjclose || [];

    const bars = ts.map((t, i) => ({
      t: t * 1000,
      o: q.open?.[i] ?? null,
      h: q.high?.[i] ?? null,
      l: q.low?.[i] ?? null,
      c: q.close?.[i] ?? null,
      v: q.volume?.[i] ?? null,
      ac: adj[i] ?? null,
    })).filter(b => b.c != null);

    // Daily returns
    const returns = [];
    for (let i = 1; i < bars.length; i++) {
      if (bars[i-1].c > 0) returns.push((bars[i].c - bars[i-1].c) / bars[i-1].c);
    }

    const n = returns.length;
    const mean = n ? returns.reduce((a,b)=>a+b,0)/n : 0;
    const variance = n ? returns.reduce((a,b)=>a+(b-mean)**2,0)/n : 0;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? mean/stdDev*Math.sqrt(252) : 0;
    const sorted = [...returns].sort((a,b)=>a-b);
    const var95 = sorted[Math.floor(sorted.length*0.05)] ?? 0;
    const prices = bars.map(b=>b.c);
    let peak = prices[0] || 0, maxDD = 0;
    prices.forEach(p => { if(p>peak)peak=p; const dd=(p-peak)/peak; if(dd<maxDD)maxDD=dd; });
    const totalReturn = prices.length > 1 ? (prices[prices.length-1]/prices[0]-1) : 0;

    // Skewness & kurtosis
    const skew = stdDev > 0 ? returns.reduce((a,b)=>a+(b-mean)**3,0)/n/stdDev**3 : 0;
    const kurt = stdDev > 0 ? returns.reduce((a,b)=>a+(b-mean)**4,0)/n/stdDev**4-3 : 0;
    const upDays = returns.filter(r=>r>0).length;
    const downDays = returns.filter(r=>r<0).length;
    const gAvg = upDays ? returns.filter(r=>r>0).reduce((a,b)=>a+b,0)/upDays : 0;
    const lAvg = downDays ? Math.abs(returns.filter(r=>r<0).reduce((a,b)=>a+b,0)/downDays) : 0;
    const profitFactor = lAvg > 0 ? gAvg/lAvg : 0;

    const out = {
      symbol, range, interval,
      bars,
      returns,
      stats: { mean, stdDev, sharpe, var95, maxDrawdown: maxDD, count: bars.length,
               totalReturn, skew, kurt, upDays, downDays, profitFactor,
               bestDay: sorted[sorted.length-1] ?? 0, worstDay: sorted[0] ?? 0 }
    };

    cache[key] = { data: out, ts: now };
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', `s-maxage=${Math.floor(ttl/1000)}`);
    res.status(200).json(out);
  } catch (err) {
    console.error('[history]', symbol, err.message);
    res.status(500).json({ error: err.message, bars: [], stats: {} });
  }
};
