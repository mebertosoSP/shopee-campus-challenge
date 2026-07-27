const { connectLambda, getStore } = require('@netlify/blobs');
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

    const payload = JSON.parse(event.body || '{}');
    const organization = payload.organization || null;
    const user = payload.user || null;
    const registrationToken = String(payload.registrationToken || '').trim();

    if (!organization || !user) {
      return json(400, { message: 'Organization and user payloads are required.' });
    }

    const orgEmail = normalizeEmail(organization.email);
    const userEmail = normalizeEmail(user.email);

    if (!orgEmail || !userEmail) {
      return json(400, { message: 'A valid organization email is required.' });
    }
    if (orgEmail !== userEmail) {
      return json(400, { message: 'Organization and user email must match.' });
    }
    if (!registrationToken) {
      return json(401, { message: 'Registration verification is required. Please verify your email again.' });
    }

    const ip = getClientIp(event);
    const byIp = await consumeLimit(`register-org:ip:${ip}`, 15, 10 * 60 * 1000);
    if (!byIp.allowed) {
      return json(429, { message: 'Too many registration attempts. Please try again later.' });
    }
    const byEmail = await consumeLimit(`register-org:email:${orgEmail}`, 5, 10 * 60 * 1000);
    if (!byEmail.allowed) {
      return json(429, { message: 'Too many registration attempts for this email. Please try again later.' });
    }

    const store = getStore('acc-club');
    const ticket = await store.get(`register-ticket:${registrationToken}`, { type: 'json' });
    if (!ticket) {
      return json(401, { message: 'Registration token is invalid or expired. Please verify your email again.' });
    }
    if (Date.now() > Number(ticket.expiresAt || 0)) {
      await store.delete(`register-ticket:${registrationToken}`);
      return json(401, { message: 'Registration token has expired. Please verify your email again.' });
    }
    if (normalizeEmail(ticket.email || '') !== orgEmail) {
      return json(401, { message: 'Registration token does not match this email.' });
    }

    const current = (await store.get('registrations', { type: 'json' })) || [];

    const filtered = current.filter((entry) => {
      const savedOrgEmail = normalizeEmail(entry?.organization?.email);
      const savedUserEmail = normalizeEmail(entry?.user?.email);
      return savedOrgEmail !== orgEmail && savedUserEmail !== userEmail;
    });

    filtered.push({ organization, user });
    await store.setJSON('registrations', filtered);
    await store.delete(`register-ticket:${registrationToken}`);

    return json(200, { saved: true });
  } catch (error) {
    return json(500, { message: error.message || 'Unexpected server error.' });
  }
};
