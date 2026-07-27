const { connectLambda, getStore } = require('@netlify/blobs');
const { consumeLimit, getClientIp } = require('./_rate-limit');
const crypto = require('crypto');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  try {
    connectLambda(event);

    if (event.httpMethod !== 'POST') {
      return json(405, { message: 'Method not allowed.' });
    }

    const payload = JSON.parse(event.body || '{}');
    const email = String(payload.email || '').trim().toLowerCase();
    const code = String(payload.code || '').trim();

    if (!email || !code) {
      return json(400, { message: 'Email and code are required.' });
    }

    const ip = getClientIp(event);
    const byIp = await consumeLimit(`otp-verify:ip:${ip}`, 30, 10 * 60 * 1000);
    if (!byIp.allowed) {
      return json(429, { verified: false, message: 'Too many verification attempts. Please try again later.' });
    }
    const byEmail = await consumeLimit(`otp-verify:email:${email}`, 8, 10 * 60 * 1000);
    if (!byEmail.allowed) {
      return json(429, { verified: false, message: 'Too many attempts for this email. Please request a new code later.' });
    }

    const store = getStore('acc-club');
    const record = await store.get(`verify:${email}`, { type: 'json' });

    if (!record) {
      return json(400, { verified: false, message: 'Verification code not found. Please request a new code.' });
    }

    if (Date.now() > Number(record.expiresAt || 0)) {
      await store.delete(`verify:${email}`);
      return json(400, { verified: false, message: 'Verification code expired. Please request a new code.' });
    }

    if (String(record.code) !== code) {
      const attemptsKey = `verify-attempts:${email}`;
      const attempts = (await store.get(attemptsKey, { type: 'json' })) || { count: 0, expiresAt: Date.now() + (10 * 60 * 1000) };
      if (Date.now() > Number(attempts.expiresAt || 0)) {
        attempts.count = 0;
        attempts.expiresAt = Date.now() + (10 * 60 * 1000);
      }
      attempts.count = Number(attempts.count || 0) + 1;
      await store.setJSON(attemptsKey, attempts);
      if (attempts.count >= 6) {
        await store.delete(`verify:${email}`);
        await store.delete(attemptsKey);
        return json(429, { verified: false, message: 'Too many invalid code attempts. A new code is required.' });
      }
      return json(400, { verified: false, message: 'Invalid verification code.' });
    }

    const registrationToken = crypto.randomUUID().replace(/-/g, '');
    await store.setJSON(`register-ticket:${registrationToken}`, {
      email,
      expiresAt: Date.now() + (15 * 60 * 1000)
    });

    await store.delete(`verify-attempts:${email}`);
    await store.delete(`verify:${email}`);
    return json(200, { verified: true, registrationToken, registrationTokenExpiresAt: Date.now() + (15 * 60 * 1000) });
  } catch (error) {
    return json(500, { message: error.message || 'Unexpected server error.' });
  }
};
