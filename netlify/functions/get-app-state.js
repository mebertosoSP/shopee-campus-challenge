const { connectLambda, getStore } = require('@netlify/blobs');
const { consumeLimit, getClientIp } = require('./_rate-limit');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function sanitizeOutboundState(rawState) {
  const state = rawState || {};
  const users = (Array.isArray(state.users) ? state.users : []).map((user) => {
    const role = String(user?.role || 'organization').toLowerCase();
    return {
      ...user,
      email: normalizeEmail(user?.email || ''),
      role,
      password: role === 'admin' ? '' : String(user?.password || '')
    };
  });

  return {
    ...state,
    users,
    organizations: Array.isArray(state.organizations) ? state.organizations : [],
    inquiries: Array.isArray(state.inquiries) ? state.inquiries : [],
    referralDirectory: Array.isArray(state.referralDirectory) ? state.referralDirectory : []
  };
}

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

    const ip = getClientIp(event);
    const limiter = await consumeLimit(`get-app-state:${ip}`, 120, 60 * 1000);
    if (!limiter.allowed) {
      return json(429, { message: 'Too many requests. Please try again shortly.' });
    }

    const store = getStore('acc-club');
    const state = await store.get('app-state', { type: 'json' });
    return json(200, { state: sanitizeOutboundState(state || null) });
  } catch (error) {
    return json(500, { message: error.message || 'Unexpected server error.' });
  }
};
