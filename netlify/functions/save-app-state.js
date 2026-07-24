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

function sanitizeState(rawState) {
  const state = rawState || {};
  return {
    users: Array.isArray(state.users) ? state.users : [],
    organizations: Array.isArray(state.organizations) ? state.organizations : [],
    inquiries: Array.isArray(state.inquiries) ? state.inquiries : [],
    referralDirectory: Array.isArray(state.referralDirectory) ? state.referralDirectory : [],
    leaderboardSync: state.leaderboardSync && typeof state.leaderboardSync === 'object'
      ? {
        source: String(state.leaderboardSync.source || ''),
        lastSyncedAt: String(state.leaderboardSync.lastSyncedAt || ''),
        updatedOrganizations: Number(state.leaderboardSync.updatedOrganizations || 0),
        totalSheetRows: Number(state.leaderboardSync.totalSheetRows || 0)
      }
      : null
  };
}

exports.handler = async (event) => {
  try {
    connectLambda(event);

    if (event.httpMethod !== 'POST') {
      return json(405, { message: 'Method not allowed.' });
    }

    const payload = JSON.parse(event.body || '{}');
    const state = sanitizeState(payload.state);

    const store = getStore('acc-club');
    await store.setJSON('app-state', state);

    return json(200, { saved: true });
  } catch (error) {
    return json(500, { message: error.message || 'Unexpected server error.' });
  }
};
