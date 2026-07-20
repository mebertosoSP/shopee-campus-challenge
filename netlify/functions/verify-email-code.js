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
      return json(400, { verified: false, message: 'Invalid verification code.' });
    }

    await store.delete(`verify:${email}`);
    return json(200, { verified: true });
  } catch (error) {
    return json(500, { message: error.message || 'Unexpected server error.' });
  }
};
