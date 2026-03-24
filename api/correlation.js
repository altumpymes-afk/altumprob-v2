// api/correlation.js
const https = require('https');

function get(url) {
  return new Promise((res, rej) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.yahoo.com/' },
      timeout: 15000,
    }, r => {
      let d = ''; r.on('data', c => d+=c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch(e) { rej(e); } });
    });
    req.on('error', rej);
    req.on('timeout', () => { req.destroy(); rej(new Error('Timeout')); });
  });
}

async function getReturns(symbol, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  try {
    const data = await get(url);
    const result = data?.chart?.result?.[0];
    if (!result) return [];
    const close = result.indicators?.quote?.[0]?.close || [];
    const returns = [];
    for (let i = 1; i < close.length; i++) {
      if (close[i-1] > 0 && close[i] != null) returns.push((close[i]-close[i-1])/close[i-1]);
    }
    return returns;
  } catch { return []; }
}

function corr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 15) return null;
  const ra = a.slice(-n), rb = b.slice(-n);
  const ma = ra.reduce((s,v)=>s+v,0)/n, mb = rb.reduce((s,v)=>s+v,0)/n;
  let num=0,da=0,db=0;
  for(let i=0;i<n;i++){num+=(ra[i]-ma)*(rb[i]-mb);da+=(ra[i]-ma)**2;db+=(rb[i]-mb)**2;}
  return da*db>0 ? num/Math.sqrt(da*db) : 0;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  const { symbols='', range='6mo' } = req.query;
  const syms = [...new Set(['SPY', ...symbols.split(',').map(s=>s.trim()).filter(Boolean)])];

  try {
    const allR = {};
    await Promise.all(syms.map(async s => { allR[s] = await getReturns(s, range); }));

    const matrix = {};
    syms.forEach(s1 => { matrix[s1]={};
      syms.forEach(s2 => { matrix[s1][s2] = s1===s2 ? 1 : corr(allR[s1], allR[s2]); });
    });

    const spyR = allR['SPY'] || [];
    const betas = {};
    syms.filter(s=>s!=='SPY').forEach(s => {
      const r=allR[s], n=Math.min(r.length, spyR.length);
      if(n<15){betas[s]=null;return;}
      const ra=r.slice(-n),rb=spyR.slice(-n),mb=rb.reduce((s,v)=>s+v,0)/n;
      let cov=0,varb=0;
      for(let i=0;i<n;i++){cov+=ra[i]*rb[i];varb+=(rb[i]-mb)**2;}
      betas[s]=varb>0?(cov/n-(ra.reduce((s,v)=>s+v,0)/n)*mb)/(varb/n):null;
    });

    res.setHeader('Cache-Control', 's-maxage=300');
    res.status(200).json({ matrix, betas, symbols: syms, range });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
};
