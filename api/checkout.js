// api/checkout.js — Stripe payment links
// POST /api/checkout  body: { plan, email, token }

const https = require('https');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

// Stripe price IDs — you create these in your Stripe dashboard
// dashboard.stripe.com → Products → Add product
const PRICES = {
  pro: process.env.STRIPE_PRICE_PRO || 'price_pro_placeholder',
  institutional: process.env.STRIPE_PRICE_INST || 'price_inst_placeholder',
};

function stripePost(path, params) {
  return new Promise((res, rej) => {
    const body = new URLSearchParams(params).toString();
    const opts = {
      method: 'POST',
      hostname: 'api.stripe.com',
      path,
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    };
    const req = https.request(opts, r => {
      let d = ''; r.on('data', c => d+=c);
      r.on('end', () => { try { res({ status: r.statusCode, data: JSON.parse(d) }); } catch(e) { rej(e); } });
    });
    req.on('error', rej);
    req.on('timeout', () => { req.destroy(); rej(new Error('Timeout')); });
    req.write(body); req.end();
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!STRIPE_KEY) {
    return res.status(200).json({ ok: false, error: 'Stripe not configured' });
  }

  let body = '';
  await new Promise(resolve => { req.on('data', c => body+=c); req.on('end', resolve); });
  const { plan, email, successUrl, cancelUrl } = JSON.parse(body || '{}');

  if (!plan || !PRICES[plan]) return res.status(400).json({ error: 'Plan inv\u00e1lido' });

  try {
    const origin = req.headers.origin || 'https://altumprob.vercel.app';
    const r = await stripePost('/v1/checkout/sessions', {
      'payment_method_types[]': 'card',
      'mode': 'subscription',
      'customer_email': email || '',
      'line_items[0][price]': PRICES[plan],
      'line_items[0][quantity]': '1',
      'success_url': successUrl || `${origin}/?payment=success&plan=${plan}`,
      'cancel_url': cancelUrl || `${origin}/?payment=cancelled`,
      'metadata[plan]': plan,
      'metadata[email]': email || '',
    });

    if (r.data?.url) {
      return res.status(200).json({ ok: true, url: r.data.url, sessionId: r.data.id });
    }
    return res.status(200).json({ ok: false, error: r.data?.error?.message || 'Error creating session' });
  } catch (err) {
    console.error('[checkout]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
