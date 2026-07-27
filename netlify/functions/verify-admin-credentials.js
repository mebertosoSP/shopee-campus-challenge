const { connectLambda } = require('@netlify/blobs');
const { createAdminToken, safeEquals } = require('./_admin-auth');
const { consumeLimit, getClientIp } = require('./_rate-limit');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

exports.handler = async (event) => {
  try {
    connectLambda(event);

    if (event.httpMethod !== 'POST') {
      return json(405, { message: 'Method not allowed.' });
    }

    const expectedEmail = normalizeEmail(process.env.ADMIN_EMAIL || '');
    const expectedPassword = String(process.env.ADMIN_PASSWORD || '');
    if (!expectedEmail || !expectedPassword) {
      return json(500, { message: 'Admin credentials are not configured.' });
    }

    const payload = JSON.parse(event.body || '{}');
    const email = normalizeEmail(payload.email || '');
    const password = String(payload.password || '');

    const ip = getClientIp(event);
    const limiter = await consumeLimit(`admin-login:${ip}:${email || 'unknown'}`, 10, 10 * 60 * 1000);
    if (!limiter.allowed) {
      return json(429, { message: 'Too many admin login attempts. Please try again later.' });
    }

    if (!email || !password) {
      return json(400, { message: 'Email and password are required.' });
    }

    if (email !== expectedEmail || !safeEquals(password, expectedPassword)) {
      return json(401, { message: 'Invalid admin credentials.' });
    }

    const tokenData = createAdminToken(expectedEmail, 60 * 60);
    return json(200, {
      ok: true,
      role: 'admin',
      email: expectedEmail,
      adminToken: tokenData.token,
      expiresAt: tokenData.expiresAt
    });
  } catch (error) {
    return json(500, { message: error.message || 'Unexpected server error.' });
  }
};
