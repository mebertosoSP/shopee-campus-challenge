const { connectLambda, getStore } = require('@netlify/blobs');
const { requireAdmin } = require('./_admin-auth');

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

    const auth = requireAdmin(event);
    if (!auth.ok) {
      return json(auth.statusCode || 401, { message: auth.message });
    }

    const store = getStore('acc-club');
    const registrations = (await store.get('registrations', { type: 'json' })) || [];
    return json(200, { registrations });
  } catch (error) {
    return json(500, { message: error.message || 'Unexpected server error.' });
  }
};
