const { connectLambda, getStore } = require('@netlify/blobs');
const { consumeLimit, getClientIp } = require('./_rate-limit');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function sanitizeReferralCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
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

function sanitizeState(rawState) {
  const state = rawState || {};
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || '');
  const incomingUsers = Array.isArray(state.users) ? state.users : [];
  const incomingOrganizations = Array.isArray(state.organizations) ? state.organizations : [];

  const users = incomingUsers
    .map((user) => ({
      id: Number(user?.id) || Date.now(),
      name: String(user?.name || '').trim().slice(0, 120),
      email: normalizeEmail(user?.email || ''),
      password: String(user?.password || '').slice(0, 256),
      role: String(user?.role || 'organization').toLowerCase(),
      organizationId: Number(user?.organizationId) || null,
      points: Number(user?.points || 0),
      weeklyReferrals: Number(user?.weeklyReferrals || 0),
      rewardTier: String(user?.rewardTier || '').slice(0, 64)
    }))
    .filter((user) => {
      if (!user.email) return false;
      if (user.role === 'admin') {
        return adminEmail && user.email === adminEmail;
      }
      return user.role === 'organization';
    })
    .map((user) => (user.role === 'admin' ? { ...user, password: '' } : user));

  const organizations = incomingOrganizations
    .map((org) => {
      const rawStatus = String(org?.verificationStatus || '').toLowerCase();
      const verificationStatus = rawStatus === 'rejected' ? 'rejected' : rawStatus === 'pending' ? 'pending' : 'verified';
      return {
        ...org,
        id: Number(org?.id) || Date.now(),
        name: String(org?.name || '').trim().slice(0, 160),
        email: normalizeEmail(org?.email || ''),
        acronym: String(org?.acronym || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 12),
        university: String(org?.university || '').trim().slice(0, 160),
        referralCode: sanitizeReferralCode(org?.referralCode || ''),
        verificationStatus,
        rejectionReason: String(org?.rejectionReason || '').trim().slice(0, 500),
        qualifiedReferrals: Number(org?.qualifiedReferrals || 0),
        weeklyReferrals: Number(org?.weeklyReferrals || 0)
      };
    })
    .filter((org) => org.name && org.email);

  const inquiries = (Array.isArray(state.inquiries) ? state.inquiries : [])
    .map((inquiry) => ({
      ...inquiry,
      id: Number(inquiry?.id) || Date.now(),
      email: normalizeEmail(inquiry?.email || ''),
      message: String(inquiry?.message || '').slice(0, 2000),
      status: String(inquiry?.status || 'pending') === 'resolved' ? 'resolved' : 'pending'
    }));

  const referralDirectory = (Array.isArray(state.referralDirectory) ? state.referralDirectory : [])
    .map((entry) => ({
      id: Number(entry?.id) || Date.now(),
      name: String(entry?.name || '').trim().slice(0, 160),
      code: sanitizeReferralCode(entry?.code || '')
    }))
    .filter((entry) => entry.name && entry.code);

  return {
    users,
    organizations,
    inquiries,
    referralDirectory,
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

    const ip = getClientIp(event);
    const limiter = await consumeLimit(`save-app-state:${ip}`, 120, 60 * 1000);
    if (!limiter.allowed) {
      return json(429, { message: 'Too many save requests. Please slow down and retry.' });
    }

    const payload = JSON.parse(event.body || '{}');
    const state = sanitizeState(payload.state);

    const store = getStore('acc-club');
    const current = (await store.get('app-state', { type: 'json' })) || {};
    const currentUsers = Array.isArray(current.users) ? current.users : [];
    const persistedAdmin = currentUsers.find((user) => String(user?.role || '').toLowerCase() === 'admin');
    const hasAdminInIncoming = state.users.some((user) => String(user?.role || '').toLowerCase() === 'admin');
    if (!hasAdminInIncoming && persistedAdmin) {
      state.users.push({
        ...persistedAdmin,
        email: normalizeEmail(persistedAdmin.email || ''),
        password: ''
      });
    }
    await store.setJSON('app-state', state);

    return json(200, { saved: true });
  } catch (error) {
    return json(500, { message: error.message || 'Unexpected server error.' });
  }
};
