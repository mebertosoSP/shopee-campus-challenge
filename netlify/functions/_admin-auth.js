const crypto = require('crypto');

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function sign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function safeEquals(a, b) {
  const first = Buffer.from(String(a || ''));
  const second = Buffer.from(String(b || ''));
  if (first.length !== second.length) return false;
  return crypto.timingSafeEqual(first, second);
}

function getSecret() {
  return String(process.env.ADMIN_SESSION_SECRET || '').trim();
}

function createAdminToken(email, ttlSeconds = 60 * 60) {
  const secret = getSecret();
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET is not configured.');
  }
  const exp = Date.now() + (Number(ttlSeconds) * 1000);
  const payload = {
    email: String(email || '').trim().toLowerCase(),
    role: 'admin',
    exp
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: exp
  };
}

function verifyAdminToken(token) {
  const secret = getSecret();
  if (!secret) {
    return { ok: false, message: 'ADMIN_SESSION_SECRET is not configured.' };
  }

  const raw = String(token || '').trim();
  if (!raw || !raw.includes('.')) {
    return { ok: false, message: 'Missing or invalid admin token.' };
  }

  const [encodedPayload, signature] = raw.split('.', 2);
  const expected = sign(encodedPayload, secret);
  if (!safeEquals(signature, expected)) {
    return { ok: false, message: 'Invalid admin token signature.' };
  }

  let payload = null;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch (_error) {
    return { ok: false, message: 'Invalid admin token payload.' };
  }

  if (!payload || payload.role !== 'admin') {
    return { ok: false, message: 'Invalid admin token role.' };
  }
  if (!payload.email) {
    return { ok: false, message: 'Invalid admin token subject.' };
  }
  if (!Number(payload.exp) || Date.now() > Number(payload.exp)) {
    return { ok: false, message: 'Admin token has expired.' };
  }

  return {
    ok: true,
    email: String(payload.email).trim().toLowerCase(),
    role: 'admin',
    expiresAt: Number(payload.exp)
  };
}

function getBearerToken(event) {
  const authHeader = event?.headers?.authorization || event?.headers?.Authorization || '';
  if (!authHeader) return '';
  const text = String(authHeader);
  if (!text.toLowerCase().startsWith('bearer ')) return '';
  return text.slice(7).trim();
}

function requireAdmin(event) {
  const token = getBearerToken(event);
  if (!token) {
    return { ok: false, statusCode: 401, message: 'Admin authorization is required.' };
  }
  const verified = verifyAdminToken(token);
  if (!verified.ok) {
    return { ok: false, statusCode: 401, message: verified.message || 'Invalid admin authorization.' };
  }
  return { ok: true, email: verified.email, expiresAt: verified.expiresAt };
}

module.exports = {
  createAdminToken,
  requireAdmin,
  safeEquals
};
