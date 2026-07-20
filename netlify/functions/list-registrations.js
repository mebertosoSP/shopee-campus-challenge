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

    const store = getStore('acc-club');
    const registrations = (await store.get('registrations', { type: 'json' })) || [];
    return json(200, { registrations });
  } catch (error) {
    return json(500, { message: error.message || 'Unexpected server error.' });
  }
};
