const { getStore } = require('@netlify/blobs');

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
    if (event.httpMethod !== 'POST') {
      return json(405, { message: 'Method not allowed.' });
    }

    const store = getStore('acc-club');
    const state = await store.get('app-state', { type: 'json' });
    return json(200, { state: state || null });
  } catch (error) {
    return json(500, { message: error.message || 'Unexpected server error.' });
  }
};
