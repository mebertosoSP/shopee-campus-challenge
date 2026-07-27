const { getStore } = require('@netlify/blobs');

async function consumeLimit(key, limit, windowMs) {
  const store = getStore('acc-security');
  const now = Date.now();
  const parsedLimit = Math.max(1, Number(limit) || 1);
  const parsedWindowMs = Math.max(1000, Number(windowMs) || 60_000);

  const record = (await store.get(key, { type: 'json' })) || { count: 0, resetAt: now + parsedWindowMs };
  if (now > Number(record.resetAt || 0)) {
    record.count = 0;
    record.resetAt = now + parsedWindowMs;
  }

  record.count = Number(record.count || 0) + 1;
  await store.setJSON(key, record);

  const remaining = Math.max(0, parsedLimit - record.count);
  return {
    allowed: record.count <= parsedLimit,
    remaining,
    resetAt: Number(record.resetAt || now + parsedWindowMs)
  };
}

function getClientIp(event) {
  const forwarded = event?.headers?.['x-forwarded-for'] || event?.headers?.['X-Forwarded-For'] || '';
  return String(forwarded).split(',')[0].trim() || 'unknown-ip';
}

module.exports = {
  consumeLimit,
  getClientIp
};
