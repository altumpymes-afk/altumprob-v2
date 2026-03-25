// api/webhook.js â Stripe webhook, activates plan after successful payment
// Configure in Stripe dashboard: Developers â Webhooks â Add endpoint
// URL: https://your-app.vercel.app/api/webhook
// Events: checkout.session.completed, customer.subscription.deleted

const https = require('https');
const crypto = require('crypto');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function supabasePatch(path, body) {
  return new Promise((res, rej) => {
    const data = JSON.stringify(body);
    const url = new URL(SUPABASE_URL + path);
    const opts = {
      method: 'PATCH', hostname: url.hostname, path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json', 'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(opts, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); });
    req.on('error', rej);
    req.write(data); req.end();
  });
}

// Stripe requires raw body for signature verification
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  let rawBody = '';
  await new Promise(resolve => { req.on('data', c => rawBody += c); req.on('end', resolve); });

  // Verify Stripe signature
  if (WEBHOOK_SECRET) {
    const sig = req.headers['stripe-signature'];
    const parts = sig?.split(',').reduce((acc, p) => { const [k,v]=p.split('='); acc[k]=v; return acc; }, {});
    const timestamp = parts?.t;
    const expectedSig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
    if (parts?.v1 !== expectedSig) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
  }

  let event;
  try { event = JSON.parse(rawBody); } catch { return res.status(400).json({ error: 'Parse error' }); }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.metadata?.email || session.customer_email;
      const plan = session.metadata?.plan || 'pro';
      if (email && SUPABASE_URL) {
        await supabasePatch(`/rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
          plan, stripe_customer_id: session.customer, stripe_subscription_id: session.subscription,
          plan_activated_at: new Date().toISOString()
        });
        console.log(`[webhook] Activated ${plan} for ${email}`);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const customerId = sub.customer;
      if (customerId && SUPABASE_URL) {
        await supabasePatch(`/rest/v1/users?stripe_customer_id=eq.${customerId}`, {
          plan: 'free', stripe_subscription_id: null
        });
        console.log(`[webhook] Downgraded to free for customer ${customerId}`);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook]', err.message);
    res.status(500).json({ error: err.message });
  }
};
