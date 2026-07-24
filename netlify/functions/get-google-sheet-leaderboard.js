const { connectLambda, getStore } = require('@netlify/blobs');
const { google } = require('googleapis');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

function sanitizeReferralCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function parseReferralCount(value) {
  const numeric = Number(String(value || '').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(numeric)) return 0;
  const rounded = Math.round(numeric);
  return Math.max(0, Math.min(300, rounded));
}

function normalizeTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).trim();
  }
  return date.toISOString();
}

function parseSheetRows(values) {
  const rows = [];

  (values || []).forEach((rawRow) => {
    const row = Array.isArray(rawRow) ? rawRow : [];
    const referralCode = sanitizeReferralCode(row[0]);
    const successfulReferralCount = parseReferralCount(row[1]);
    const latestVoucherTimestamp = normalizeTimestamp(row[2]);

    const headerLike = String(row[0] || '').toLowerCase().includes('referral')
      && String(row[1] || '').toLowerCase().includes('count');

    if (headerLike || !referralCode) return;

    rows.push({
      referralCode,
      successfulReferralCount,
      latestVoucherTimestamp
    });
  });

  return rows;
}

async function readSheetRowsFromGoogle() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const range = process.env.GOOGLE_SHEETS_RANGE;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!spreadsheetId || !range || !clientEmail || !privateKey) {
    throw new Error('Missing Google Sheets environment variables. Required: GOOGLE_SHEETS_ID, GOOGLE_SHEETS_RANGE, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY.');
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range
  });

  return parseSheetRows(response.data.values || []);
}

exports.handler = async (event) => {
  try {
    connectLambda(event);

    if (event.httpMethod !== 'POST') {
      return json(405, { message: 'Method not allowed.' });
    }

    const rows = await readSheetRowsFromGoogle();

    const store = getStore('acc-club');
    const state = (await store.get('app-state', { type: 'json' })) || {};
    const organizations = Array.isArray(state.organizations) ? state.organizations : [];

    const organizationsByCode = new Map();
    organizations.forEach((org) => {
      const code = sanitizeReferralCode(org.referralCode);
      if (!code) return;
      organizationsByCode.set(code, org);
    });

    const rowsWithOrg = rows.map((row) => {
      const organization = organizationsByCode.get(row.referralCode);
      return {
        ...row,
        organizationName: organization ? organization.name : ''
      };
    });

    const sheetCodes = new Set(rows.map((row) => row.referralCode));
    const unmatchedSheetCodes = rows
      .filter((row) => !organizationsByCode.has(row.referralCode))
      .map((row) => row.referralCode);

    const unmatchedOrganizations = organizations
      .filter((org) => {
        const code = sanitizeReferralCode(org.referralCode);
        return code && !sheetCodes.has(code);
      })
      .map((org) => ({
        name: org.name,
        referralCode: sanitizeReferralCode(org.referralCode)
      }));

    const matchedCount = rowsWithOrg.filter((row) => Boolean(row.organizationName)).length;

    return json(200, {
      rows: rowsWithOrg,
      matchedCount,
      unmatchedSheetCodes,
      unmatchedOrganizations,
      lastSyncedAt: state.leaderboardSync?.lastSyncedAt || ''
    });
  } catch (error) {
    return json(500, { message: error.message || 'Unexpected server error.' });
  }
};
