const { connectLambda, getStore } = require('@netlify/blobs');

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

    if (!organization || !user) {
      return json(400, { message: 'Organization and user payloads are required.' });
    }

    const orgEmail = normalizeEmail(organization.email);
    const userEmail = normalizeEmail(user.email);

    if (!orgEmail || !userEmail) {
      return json(400, { message: 'A valid organization email is required.' });
    }

    const store = getStore('acc-club');
    const current = (await store.get('registrations', { type: 'json' })) || [];

    const filtered = current.filter((entry) => {
      const savedOrgEmail = normalizeEmail(entry?.organization?.email);
      const savedUserEmail = normalizeEmail(entry?.user?.email);
      return savedOrgEmail !== orgEmail && savedUserEmail !== userEmail;
    });

    filtered.push({ organization, user });
    await store.setJSON('registrations', filtered);

    return json(200, { saved: true });
  } catch (error) {
    return json(500, { message: error.message || 'Unexpected server error.' });
  }
};
