// api/auth.js — User auth via Supabase
// POST /api/auth  body: { action, email, password, name, plan }
// actions: register | login | me | update

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function supabase(method, path, body) {
  return new Promise((res, rej) => {
    const url = new URL(SUPABASE_URL + path);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method, hostname: url.hostname, path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
      timeout: 10000,
    };
    const req = https.request(opts, r => {
      let d = ''; r.on('data', c => d+=c);
      r.on('end', () => { try { res({ status: r.statusCode, data: JSON.parse(d) }); } catch(e) { rej(e); } });
    });
    req.on('error', rej);
    req.on('timeout', () => { req.destroy(); rej(new Error('Timeout')); });
    if(data) req.write(data);
    req.end();
  });
}

// Simple JWT-like token (for demo — use Supabase Auth for production-grade)
const crypto = require('crypto');
function makeToken(userId) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, ts: Date.now() })).toString('base64');
  const sig = crypto.createHmac('sha256', SUPABASE_KEY || 'fallback').update(payload).digest('base64');
  return payload + '.' + sig;
}
function verifyToken(token) {
  try {
    const [payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SUPABASE_KEY || 'fallback').update(payload).digest('base64');
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(payload, 'base64').toString());
  } catch { return null; }
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = '';
  await new Promise(resolve => { req.on('data', c => body+=c); req.on('end', resolve); });
  const { action, email, password, name, plan, token, updates } = JSON.parse(body || '{}');

  // If Supabase not configured, use fallback mode
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(200).json({ ok: false, fallback: true, message: 'Supabase not configured \u2014 using localStorage mode' });
  }

  try {
    if (action === 'register') {
      const check = await supabase('GET', `/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id`, null);
      if (check.data?.length > 0) return res.status(200).json({ ok: false, error: 'Email ya registrado' });

      const hash = crypto.createHash('sha256').update(password + SUPABASE_KEY).digest('hex');
      const insert = await supabase('POST', '/rest/v1/users', {
        email, name, password_hash: hash, plan: plan || 'free',
        watchlist: ['AAPL','GGAL','YPF','MELI','NVDA','MSFT'],
        portfolio: [], created_at: new Date().toISOString()
      });
      if (insert.status !== 201) return res.status(200).json({ ok: false, error: 'Error creando usuario' });

      const user = insert.data?.[0] || insert.data;
      const t = makeToken(user.id);
      return res.status(200).json({ ok: true, token: t, user: { ...user, password_hash: undefined } });
    }

    if (action === 'login') {
      const hash = crypto.createHash('sha256').update(password + SUPABASE_KEY).digest('hex');
      const r = await supabase('GET', `/rest/v1/users?email=eq.${encodeURIComponent(email)}&password_hash=eq.${hash}&select=*`, null);
      if (!r.data?.length) return res.status(200).json({ ok: false, error: 'Email o contrase\u00f1a incorrectos' });
      const user = r.data[0];
      const t = makeToken(user.id);
      return res.status(200).json({ ok: true, token: t, user: { ...user, password_hash: undefined } });
    }

    if (action === 'me') {
      const payload = verifyToken(token);
      if (!payload) return res.status(200).json({ ok: false, error: 'Token inv\u00e1lido' });
      const r = await supabase('GET', `/rest/v1/users?id=eq.${payload.uid}&select=*`, null);
      if (!r.data?.length) return res.status(200).json({ ok: false, error: 'Usuario no encontrado' });
      const user = r.data[0];
      return res.status(200).json({ ok: true, user: { ...user, password_hash: undefined } });
    }

    if (action === 'update') {
      const payload = verifyToken(token);
      if (!payload) return res.status(200).json({ ok: false, error: 'Token inv\u00e1lido' });
      const allowed = ['name','watchlist','portfolio','plan'];
      const safe = {};
      allowed.forEach(k => { if (updates?.[k] !== undefined) safe[k] = updates[k]; });
      await supabase('PATCH', `/rest/v1/users?id=eq.${payload.uid}`, safe);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('[auth]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
