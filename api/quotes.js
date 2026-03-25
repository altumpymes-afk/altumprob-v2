// api/quotes.js â Yahoo Finance bulk quotes, server-side, no CORS issues
const https = require('https');

const FIELDS = [
  'regularMarketPrice','regularMarketChangePercent','regularMarketVolume',
  'regularMarketOpen','regularMarketDayHigh','regularMarketDayLow',
  'averageDailyVolume10Day','fiftyTwoWeekHigh','fiftyTwoWeekLow',
  'trailingPE','priceToBook','marketCap','currency','shortName','longName',
  'sector','industry','epsTrailingTwelveMonths','bookValue',
  'fiftyDayAverage','twoHundredDayAverage','regularMarketPreviousClose',
  'trailingAnnualDividendYield',
].join(',');

function get(url) {
  return new Promise((res, rej) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/',
        'Origin': 'https://finance.yahoo.com',
        'Cookie': 'B=abc123; YSC=abc',
      },
      timeout: 15000,
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch(e) { rej(new Error('Parse error: ' + d.slice(0,100))); } });
    });
    req.on('error', rej);
    req.on('timeout', () => { req.destroy(); rej(new Error('Timeout')); });
  });
}

// Simple in-memory cache (persists across warm function invocations)
const cache = {};
const CACHE_TTL = 55000; // 55 seconds

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const symbols = (req.query.symbols || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!symbols.length) return res.status(400).json({ error: 'symbols required', quotes: {} });

  const now = Date.now();
  const stale = symbols.filter(s => !cache[s] || now - cache[s].ts > CACHE_TTL);
  const fresh = symbols.filter(s => cache[s] && now - cache[s].ts <= CACHE_TTL);

  // Fetch stale symbols in chunks of 50
  const chunks = [];
  for (let i = 0; i < stale.length; i += 50) chunks.push(stale.slice(i, i + 50));

  try {
    await Promise.all(chunks.map(async chunk => {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${chunk.join(',')}&fields=${FIELDS}&lang=en&region=US&corsDomain=finance.yahoo.com`;
      const data = await get(url);
      const quotes = data?.quoteResponse?.result || [];
      quotes.forEach(q => { if (q?.symbol) cache[q.symbol] = { data: q, ts: now }; });
    }));

    const result = {};
    symbols.forEach(s => { if (cache[s]) result[s] = cache[s].data; });

    res.setHeader('Cache-Control', 's-maxage=55, stale-while-revalidate=10');
    res.setHeader('X-Cache-Fresh', fresh.length);
    res.setHeader('X-Cache-Fetched', stale.length);
    res.status(200).json({ quotes: result, ts: now, count: Object.keys(result).length });
  } catch (err) {
    console.error('[quotes]', err.message);
    // Return whatever is in cache even if stale
    const result = {};
    symbols.forEach(s => { if (cache[s]) result[s] = cache[s].data; });
    res.status(200).json({ quotes: result, ts: now, count: Object.keys(result).length, stale: true, error: err.message });
  }
};
