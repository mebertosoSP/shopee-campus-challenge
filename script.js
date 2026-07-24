const SESSION_USER_KEY = 'shopee-after-class-user-id';
const ADMIN_EMAIL = 'miguel.bertoso@shopee.com';
let adminSelectedOrgId = null;
let adminReferralFilter = 'all';
let adminDashboardOrgId = null;
let adminInquiryFilter = 'pending';
let adminResetPasswordOrgId = null;
let adminReferralDirectoryQuery = '';
let adminReferralDirectoryPage = 1;
let adminEditingDirectoryId = null;
let adminReferralDirectoryStatusMessage = '';
let pendingRegistrationDraft = null;
let adminSyncTimer = null;
let adminSheetWindowTimer = null;
const CAMPAIGN_END_ISO = '2026-10-03T23:59:59';
const REFERRAL_DIRECTORY_PAGE_SIZE = 8;
const FUNCTIONS_BASE = '/.netlify/functions';
const ROADSHOW_MAX_RANK = 11;
let saveStateTimer = null;
const DECLINE_REASONS = [
  'Acronym is not appropriate.',
  'Email is invalid.',
  'Incomplete details.',
  'Organization not found.',
  'Screenshot does not capture ShopeePay details and username.',
  'ShopeePay is not verified.',
  'University not found.',
  'Other.'
];

function sanitizeReferralCode(code) {
  return (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function parseReferralDirectorySeed(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const entries = [];
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const columns = line.split('\t').map((value) => value.trim()).filter(Boolean);
      if (columns.length < 2) return;
      const code = sanitizeReferralCode(columns[columns.length - 1]);
      const name = columns.slice(0, columns.length - 1).join(' ').trim();
      if (!code || !name || code === 'REFERRALCODE') return;
      entries.push({ name, code });
    });
  return entries;
}

const SEEDED_REFERRAL_DIRECTORY = parseReferralDirectorySeed(window.REFERRAL_DIRECTORY_TSV || '');

function normalizeReferralDirectory(parsedDirectory, organizations) {
  const merged = [];
  const seenCodes = new Set();
  let generatedId = (parsedDirectory || []).reduce((maxId, entry) => Math.max(maxId, Number(entry?.id) || 0), 0) + 1;

  const pushEntry = (name, code, id = null) => {
    const cleanName = (name || '').trim();
    const cleanCode = sanitizeReferralCode(code);
    if (!cleanName || !cleanCode) return;
    if (seenCodes.has(cleanCode)) return;
    seenCodes.add(cleanCode);
    merged.push({
      id: Number(id) || generatedId++,
      name: cleanName,
      code: cleanCode
    });
  };

  SEEDED_REFERRAL_DIRECTORY.forEach((entry) => pushEntry(entry.name, entry.code));
  (parsedDirectory || []).forEach((entry) => pushEntry(entry?.name, entry?.code, entry?.id));
  (organizations || []).forEach((org) => {
    if (org?.referralCode) {
      pushEntry(org.name, org.referralCode);
    }
  });

  return merged.map((entry, index) => ({
    id: Number(entry.id) || index + 1,
    name: entry.name,
    code: entry.code
  }));
}

function findDirectoryMatch(directory, rawInput) {
  const input = (rawInput || '').trim();
  if (!input) return null;

  const exactCode = sanitizeReferralCode(input);
  if (exactCode) {
    const codeMatch = (directory || []).find((entry) => entry.code === exactCode);
    if (codeMatch) return codeMatch;
  }

  const optionCode = sanitizeReferralCode(input.split('|').pop());
  if (optionCode) {
    const optionMatch = (directory || []).find((entry) => entry.code === optionCode);
    if (optionMatch) return optionMatch;
  }

  const lowered = input.toLowerCase();
  return (directory || []).find((entry) => entry.name.toLowerCase() === lowered) || null;
}

function buildReferralDirectorySelectMarkup(directory, selectedCode = '') {
  const sorted = [...(directory || [])].sort((a, b) => a.name.localeCompare(b.name));
  const options = sorted.length
    ? sorted.map((entry) => `<option value="${entry.code}"${entry.code === selectedCode ? ' selected' : ''}>${entry.name} | ${entry.code}</option>`).join('')
    : '<option value="">No referral codes available</option>';
  return `<option value="">Select referral code</option>${options}`;
}

function buildSampleReferrals(acronym, count) {
  return Array.from({ length: count }).map((_, index) => {
    const created = new Date(2026, 0, 1 + index, 9, index % 60);
    return {
      id: Number(`${Date.now()}${index}`),
      createdAt: created.toISOString(),
      fullName: `Student ${acronym}-${String(index + 1).padStart(2, '0')}`,
      email: `student${String(index + 1).padStart(2, '0')}.${acronym.toLowerCase()}@example.com`,
      status: 'active',
      deletedAt: null
    };
  });
}

const DEFAULT_ORGANIZATIONS = [
  { id: 1, name: 'Ateneo Campus Society', acronym: 'ACS', university: 'Ateneo de Manila University', qualifiedReferrals: 240, weeklyReferrals: 32, valid: true, compliant: true, inquiries: [], referralCode: 'ACS4201', referrals: buildSampleReferrals('ACS', 10) },
  { id: 2, name: 'UP Lasallian Network', acronym: 'ULN', university: 'University of the Philippines', qualifiedReferrals: 210, weeklyReferrals: 25, valid: true, compliant: true, inquiries: [], referralCode: 'ULN4102', referrals: buildSampleReferrals('ULN', 9) },
  { id: 3, name: 'Mapua Campus Creators', acronym: 'MCC', university: 'Mapua University', qualifiedReferrals: 180, weeklyReferrals: 18, valid: true, compliant: true, inquiries: [], referralCode: 'MCC3803', referrals: buildSampleReferrals('MCC', 8) },
  { id: 4, name: 'UST Community Launch', acronym: 'UCL', university: 'University of Santo Tomas', qualifiedReferrals: 165, weeklyReferrals: 20, valid: true, compliant: true, inquiries: [], referralCode: 'UCL3604', referrals: buildSampleReferrals('UCL', 8) },
  { id: 5, name: 'De La Salle Spark Lab', acronym: 'DSL', university: 'De La Salle University', qualifiedReferrals: 155, weeklyReferrals: 14, valid: true, compliant: true, inquiries: [], referralCode: 'DSL3405', referrals: buildSampleReferrals('DSL', 7) },
  { id: 6, name: 'FEU Innovation Club', acronym: 'FIC', university: 'Far Eastern University', qualifiedReferrals: 132, weeklyReferrals: 12, valid: true, compliant: true, inquiries: [], referralCode: 'FIC3306', referrals: buildSampleReferrals('FIC', 6) },
  { id: 7, name: 'Adamson Youth Hub', acronym: 'AYH', university: 'Adamson University', qualifiedReferrals: 118, weeklyReferrals: 10, valid: true, compliant: true, inquiries: [], referralCode: 'AYH3207', referrals: buildSampleReferrals('AYH', 6) },
  { id: 8, name: 'Polytechnic Pulse', acronym: 'PPP', university: 'Polytechnic University of the Philippines', qualifiedReferrals: 104, weeklyReferrals: 9, valid: true, compliant: true, inquiries: [], referralCode: 'PPP3108', referrals: buildSampleReferrals('PPP', 6) },
  { id: 9, name: 'NU Campus Collective', acronym: 'NUC', university: 'National University', qualifiedReferrals: 92, weeklyReferrals: 8, valid: true, compliant: true, inquiries: [], referralCode: 'NUC3009', referrals: buildSampleReferrals('NUC', 5) },
  { id: 10, name: 'CEU Future Leaders', acronym: 'CFL', university: 'Centro Escolar University', qualifiedReferrals: 72, weeklyReferrals: 7, valid: true, compliant: true, inquiries: [], referralCode: 'CFL2910', referrals: buildSampleReferrals('CFL', 5) },
  { id: 11, name: 'Lyceum Rise Club', acronym: 'LRC', university: 'Lyceum of the Philippines University', qualifiedReferrals: 42, weeklyReferrals: 6, valid: true, compliant: true, inquiries: [], referralCode: 'LRC2711', referrals: buildSampleReferrals('LRC', 4) }
];

function buildTrend(referrals) {
  const base = Math.max(1, referrals);
  return [
    Math.max(2, Math.round(base * 0.2)),
    Math.max(4, Math.round(base * 0.35)),
    Math.max(6, Math.round(base * 0.5)),
    Math.max(8, Math.round(base * 0.68)),
    Math.max(10, Math.round(base * 0.84)),
    Math.max(12, referrals)
  ];
}

function generateReferralCode(acronym) {
  const clean = (acronym || 'ACC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'ACC';
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `${clean}${suffix}`;
}

function generateUniqueReferralCode(state, acronym, skipOrgId = null) {
  const used = new Set((state.organizations || [])
    .filter((org) => org.id !== skipOrgId)
    .map((org) => org.referralCode));
  let code = generateReferralCode(acronym);
  while (used.has(code)) {
    code = generateReferralCode(acronym);
  }
  return code;
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

async function callBackend(functionName, payload = {}) {
  const response = await fetch(`${FUNCTIONS_BASE}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_error) {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.message || 'Request failed.');
  }

  return data || {};
}

async function syncServerRegistrationsIntoState(state) {
  try {
    const result = await callBackend('list-registrations', {});
    const records = Array.isArray(result.registrations) ? result.registrations : [];
    if (!records.length) return;

    let changed = false;
    records.forEach((record) => {
      const organization = record?.organization;
      const user = record?.user;
      if (!organization || !user) return;

      const orgExists = state.organizations.some((entry) => Number(entry.id) === Number(organization.id) || normalizeEmail(entry.email) === normalizeEmail(organization.email));
      if (!orgExists) {
        state.organizations.push(organization);
        changed = true;
      }

      const userExists = state.users.some((entry) => Number(entry.id) === Number(user.id) || normalizeEmail(entry.email) === normalizeEmail(user.email));
      if (!userExists) {
        state.users.push(user);
        changed = true;
      }
    });

    if (changed) {
      saveState(state);
    }
  } catch (_error) {
    // Keep local mode functional even if backend is unavailable.
  }
}

async function pushRegistrationToServer(newOrg, newUser) {
  return callBackend('register-organization', {
    organization: newOrg,
    user: newUser
  });
}

async function requestEmailCode(email) {
  return callBackend('send-email-code', { email });
}

async function verifyEmailCode(email, code) {
  return callBackend('verify-email-code', { email, code });
}

async function sendDenialEmail(email, organizationName, reason) {
  return callBackend('send-denial-email', {
    email,
    organizationName,
    reason
  });
}

function formatDateTimeLabel(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

async function refreshGoogleSheetWindow() {
  const status = document.getElementById('googleSheetStatus');
  const lastSync = document.getElementById('googleSheetLastSync');
  const body = document.getElementById('googleSheetTableBody');
  const mismatchList = document.getElementById('googleSheetMismatchList');
  if (!body) return;

  if (status) {
    status.textContent = 'Loading Google Sheet window...';
  }

  try {
    const result = await callBackend('get-google-sheet-leaderboard', {});
    const rows = Array.isArray(result.rows) ? result.rows : [];

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="4">No rows found in Google Sheet.</td></tr>';
    } else {
      body.innerHTML = rows.map((row) => `
        <tr>
          <td>${row.referralCode || '-'}</td>
          <td>${Number(row.successfulReferralCount || 0)}</td>
          <td>${formatDateTimeLabel(row.latestVoucherTimestamp)}</td>
          <td>${row.organizationName || '-'}</td>
        </tr>
      `).join('');
    }

    const unmatchedSheetCodes = Array.isArray(result.unmatchedSheetCodes) ? result.unmatchedSheetCodes : [];
    const unmatchedOrganizations = Array.isArray(result.unmatchedOrganizations) ? result.unmatchedOrganizations : [];
    const mismatchItems = [];

    if (unmatchedSheetCodes.length) {
      mismatchItems.push(`<div class="mission-item"><span>Sheet-only codes (${unmatchedSheetCodes.length})</span><span class="pill">${unmatchedSheetCodes.slice(0, 8).join(', ')}${unmatchedSheetCodes.length > 8 ? ' ...' : ''}</span></div>`);
    }

    if (unmatchedOrganizations.length) {
      mismatchItems.push(`<div class="mission-item"><span>Org codes missing in sheet (${unmatchedOrganizations.length})</span><span class="pill">${unmatchedOrganizations.slice(0, 4).map((org) => org.referralCode).join(', ')}${unmatchedOrganizations.length > 4 ? ' ...' : ''}</span></div>`);
    }

    if (mismatchList) {
      mismatchList.innerHTML = mismatchItems.length
        ? mismatchItems.join('')
        : '<div class="mission-item"><span>All assigned referral codes currently have sheet matches.</span></div>';
    }

    if (lastSync) {
      lastSync.textContent = `Last leaderboard sync: ${formatDateTimeLabel(result.lastSyncedAt)}`;
    }

    if (status) {
      status.textContent = `Google Sheet window loaded: ${rows.length} row(s), ${Number(result.matchedCount || 0)} matched to organizations.`;
    }
  } catch (error) {
    if (status) {
      status.textContent = `Unable to load Google Sheet window: ${error.message}`;
    }
  }
}

async function handleGoogleSheetSyncNow(state) {
  const status = document.getElementById('googleSheetStatus');
  if (status) {
    status.textContent = 'Syncing Google Sheet tallies to leaderboard...';
  }

  try {
    const result = await callBackend('sync-leaderboard-from-sheets', {});
    await refreshSharedState(state);
    renderAdmin(state);
    await refreshGoogleSheetWindow();
    if (status) {
      status.textContent = `Sync complete: ${Number(result.updatedOrganizations || 0)} organization(s) updated from ${Number(result.totalSheetRows || 0)} sheet row(s).`;
    }
  } catch (error) {
    if (status) {
      status.textContent = `Sync failed: ${error.message}`;
    }
  }
}

function buildDefaultState() {
  return {
    users: [
      { id: 1, name: 'Miguel Bertoso', email: ADMIN_EMAIL, password: 'DeezNuts2026!', role: 'admin', organizationId: 1, points: 240, weeklyReferrals: 32, rewardTier: 'Grand Champion' }
    ],
    organizations: DEFAULT_ORGANIZATIONS,
    inquiries: [],
    referralDirectory: [],
    currentUserId: null
  };
}

function readSessionUserId() {
  const raw = window.sessionStorage.getItem(SESSION_USER_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function writeSessionUserId(userId) {
  if (userId) {
    window.sessionStorage.setItem(SESSION_USER_KEY, String(userId));
  } else {
    window.sessionStorage.removeItem(SESSION_USER_KEY);
  }
}

function extractSharedState(state) {
  return {
    users: state.users || [],
    organizations: state.organizations || [],
    inquiries: state.inquiries || [],
    referralDirectory: state.referralDirectory || [],
    leaderboardSync: state.leaderboardSync || null
  };
}

async function persistSharedState(state) {
  await callBackend('save-app-state', { state: extractSharedState(state) });
}

async function saveStateNow(state) {
  writeSessionUserId(state.currentUserId || null);
  try {
    await persistSharedState(state);
    return true;
  } catch (_error) {
    return false;
  }
}

function queuePersistSharedState(state) {
  if (saveStateTimer) {
    window.clearTimeout(saveStateTimer);
  }
  saveStateTimer = window.setTimeout(() => {
    persistSharedState(state).catch(() => {
      // Keep UI usable even if backend persistence temporarily fails.
    });
  }, 120);
}

async function loadStateFromServer() {
  const fallback = normalizeState(buildDefaultState());
  fallback.currentUserId = readSessionUserId();

  try {
    const result = await callBackend('get-app-state', {});
    const hasServerState = Boolean(result?.state && Array.isArray(result.state.organizations));
    if (!hasServerState) {
      await persistSharedState(fallback);
      return fallback;
    }

    const normalized = normalizeState({
      ...result.state,
      currentUserId: readSessionUserId()
    });
    return normalized;
  } catch (_error) {
    return fallback;
  }
}

function normalizeState(parsed) {
  const organizations = (parsed.organizations || DEFAULT_ORGANIZATIONS).map((org) => {
    const rawStatus = String(org.verificationStatus || '').toLowerCase();
    const normalizedStatus = rawStatus === 'rejected' ? 'rejected' : 'verified';
    const isVerified = normalizedStatus === 'verified';
    return {
      ...org,
      acronym: (org.acronym || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
      isPlaceholder: typeof org.isPlaceholder === 'boolean' ? org.isPlaceholder : !org.createdAt,
      verificationStatus: normalizedStatus,
      rejectionReason: org.rejectionReason || '',
      valid: typeof org.valid === 'boolean' ? org.valid : isVerified,
      compliant: typeof org.compliant === 'boolean' ? org.compliant : isVerified,
      notifications: Array.isArray(org.notifications) ? org.notifications : [],
      profile: {
        contactPerson: org.profile?.contactPerson || org.contactPerson || '',
        contactPosition: org.profile?.contactPosition || org.contactPosition || '',
        contactNumber: org.profile?.contactNumber || org.contactNumber || '',
        shopeeUsername: org.profile?.shopeeUsername || org.shopeeUsername || '',
        shopeePayScreenshotName: org.profile?.shopeePayScreenshotName || org.shopeePayScreenshotName || '',
        shopeePayScreenshotData: org.profile?.shopeePayScreenshotData || ''
      },
      referralCode: sanitizeReferralCode(org.referralCode || ''),
      trend: org.trend || buildTrend(org.qualifiedReferrals),
      seedReferrals: Number.isFinite(org.seedReferrals) ? org.seedReferrals : org.qualifiedReferrals,
      weeklyEntries: Array.isArray(org.weeklyEntries) ? org.weeklyEntries : [],
      referrals: (org.referrals || []).map((ref) => ({
        ...ref,
        status: ref.status || (ref.deletedAt ? 'deleted' : 'active'),
        deletedAt: ref.deletedAt || null
      }))
    };
  });

  const usedCodes = new Set();
  organizations.forEach((org) => {
    if (org.referralCode && usedCodes.has(org.referralCode)) {
      org.referralCode = generateReferralCode(org.acronym || org.name);
      while (usedCodes.has(org.referralCode)) {
        org.referralCode = generateReferralCode(org.acronym || org.name);
      }
    }
    if (org.referralCode) {
      usedCodes.add(org.referralCode);
    }
  });

  const referralDirectory = normalizeReferralDirectory(parsed.referralDirectory, organizations);

  return {
    ...parsed,
    organizations,
    referralDirectory,
    inquiries: (parsed.inquiries || []).map((inquiry) => {
      const normalizedResponses = Array.isArray(inquiry.responses)
        ? inquiry.responses
          .map((responseEntry) => ({
            id: responseEntry.id || Date.now(),
            message: String(responseEntry.message || '').trim(),
            createdAt: responseEntry.createdAt || inquiry.repliedAt || inquiry.createdAt || new Date().toISOString()
          }))
          .filter((responseEntry) => Boolean(responseEntry.message))
        : [];

      if (!normalizedResponses.length && inquiry.response) {
        normalizedResponses.push({
          id: Date.now(),
          message: String(inquiry.response || '').trim(),
          createdAt: inquiry.repliedAt || inquiry.createdAt || new Date().toISOString()
        });
      }

      const latestResponse = normalizedResponses.length ? normalizedResponses[normalizedResponses.length - 1] : null;

      return {
        ...inquiry,
        orgId: inquiry.orgId || organizations.find((org) => org.name === inquiry.orgName || (inquiry.orgLabel || '').startsWith(org.name))?.id || null,
        createdAt: inquiry.createdAt || new Date().toISOString(),
        status: inquiry.status === 'resolved' ? 'resolved' : 'pending',
        responses: normalizedResponses,
        response: latestResponse?.message || '',
        repliedAt: latestResponse?.createdAt || inquiry.repliedAt || null
      };
    }),
    users: (parsed.users || []).map((user) => ({
      ...user,
      role: user.role || 'organization'
    }))
  };
}

function saveState(state) {
  writeSessionUserId(state.currentUserId || null);
  queuePersistSharedState(state);
}

async function refreshSharedState(state) {
  try {
    const result = await callBackend('get-app-state', {});
    if (!result?.state) return false;
    const normalized = normalizeState({
      ...result.state,
      currentUserId: state.currentUserId
    });

    state.users = normalized.users;
    state.organizations = normalized.organizations;
    state.inquiries = normalized.inquiries;
    state.referralDirectory = normalized.referralDirectory;
    state.leaderboardSync = normalized.leaderboardSync || null;
    return true;
  } catch (_error) {
    return false;
  }
}

function getCurrentUser(state) {
  return state.users.find((user) => user.id === state.currentUserId) || null;
}

function isPasswordComplex(password) {
  return /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password || '');
}

function openAdminPasswordResetModal(state, orgId) {
  const modal = document.getElementById('adminPasswordResetModal');
  const form = document.getElementById('adminPasswordResetForm');
  const orgLabel = document.getElementById('adminPasswordResetOrgLabel');
  const status = document.getElementById('adminPasswordResetStatus');
  if (!modal || !form || !orgLabel || !status) return;

  const organization = state.organizations.find((org) => org.id === orgId);
  if (!organization) return;

  adminResetPasswordOrgId = orgId;
  orgLabel.textContent = `Organization: ${organization.name}`;
  status.textContent = '';
  form.reset();
  modal.classList.remove('hidden');
}

function closeAdminPasswordResetModal() {
  const modal = document.getElementById('adminPasswordResetModal');
  if (!modal) return;
  modal.classList.add('hidden');
  adminResetPasswordOrgId = null;
}

function handleAdminPasswordResetSubmit(state, event) {
  event.preventDefault();
  const status = document.getElementById('adminPasswordResetStatus');
  const passwordInput = document.getElementById('adminResetPasswordInput');
  const confirmInput = document.getElementById('adminResetPasswordConfirm');
  if (!status || !passwordInput || !confirmInput || !adminResetPasswordOrgId) return;

  const nextPassword = passwordInput.value;
  const confirmPassword = confirmInput.value;
  if (nextPassword !== confirmPassword) {
    status.textContent = 'New password and confirmation do not match.';
    return;
  }
  if (!isPasswordComplex(nextPassword)) {
    status.textContent = 'Password must include at least one uppercase letter, one lowercase letter, and one number.';
    return;
  }

  const orgUser = state.users.find((user) => user.role === 'organization' && user.organizationId === adminResetPasswordOrgId);
  if (!orgUser) {
    status.textContent = 'No linked organization user account found.';
    return;
  }

  orgUser.password = nextPassword;
  saveState(state);
  status.textContent = 'Password reset complete.';
  window.setTimeout(() => {
    closeAdminPasswordResetModal();
    renderAdmin(state);
  }, 400);
}

function setAuthLink(state) {
  const links = document.querySelectorAll('[data-auth-link]');
  const navLinks = document.querySelector('.nav-links');
  const existingLogout = document.getElementById('globalLogoutButton');
  const currentUser = getCurrentUser(state);
  if (!currentUser) {
    links.forEach((link) => {
      link.textContent = 'Login';
      link.href = 'login.html';
    });
    if (existingLogout) {
      existingLogout.remove();
    }
    document.body.dataset.role = 'guest';
    return;
  }

  links.forEach((link) => {
    link.textContent = 'Dashboard';
    link.href = 'dashboard.html';
  });

  if (navLinks && !existingLogout) {
    const logoutButton = document.createElement('button');
    logoutButton.id = 'globalLogoutButton';
    logoutButton.className = 'button ghost';
    logoutButton.type = 'button';
    logoutButton.textContent = 'Logout (Sign out)';
    logoutButton.addEventListener('click', () => {
      state.currentUserId = null;
      saveState(state);
      window.location.href = 'login.html';
    });
    navLinks.appendChild(logoutButton);
  }

  document.body.dataset.role = currentUser.role;
}

function requireAuth(state) {
  if (!getCurrentUser(state)) {
    window.location.replace('login.html');
    return false;
  }
  document.body.classList.add('auth-ready');
  return true;
}

function formatPeso(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(amount) || 0);
}

function getRoadshowQualification(rank) {
  if (rank === 1) {
    return {
      eligible: true,
      type: 'Onsite Roadshow',
      summary: 'Eligible for the Champion onsite roadshow.'
    };
  }
  if (rank >= 2 && rank <= ROADSHOW_MAX_RANK) {
    return {
      eligible: true,
      type: 'Virtual Roadshow',
      summary: 'Eligible for the Top 2 to 11 virtual roadshow.'
    };
  }
  return {
    eligible: false,
    type: 'No Roadshow Slot Yet',
    summary: 'Not in the Top 11 leaderboard placements yet.'
  };
}

function getAwardData(org, rank) {
  const referrals = Number(org?.qualifiedReferrals || 0);

  if (rank === 1) {
    return {
      tier: 'Champion',
      amount: 20000,
      reward: `${formatPeso(20000)} in vouchers`,
      payoutText: `${formatPeso(20000)} in vouchers`,
      highlight: 'Rank #1 Champion override. Includes the onsite roadshow.',
      tierClass: 'grand'
    };
  }

  if (referrals >= 200) {
    return {
      tier: 'Diamond',
      amount: 8500,
      reward: `${formatPeso(8500)} in vouchers`,
      payoutText: `${formatPeso(8500)} in vouchers`,
      highlight: 'Referral-based tier: 200 or more validated referrals.',
      tierClass: 'diamond'
    };
  }

  if (referrals >= 100) {
    return {
      tier: 'Gold',
      amount: 4500,
      reward: `${formatPeso(4500)} in vouchers`,
      payoutText: `${formatPeso(4500)} in vouchers`,
      highlight: 'Referral-based tier: 100 to 199 validated referrals.',
      tierClass: 'gold'
    };
  }

  return {
    tier: 'Base',
    amount: 0,
    reward: `${formatPeso(0)} (all vouchers)`,
    payoutText: `${formatPeso(0)} (all vouchers)`,
    highlight: 'Referral-based tier: 0 to 99 validated referrals.',
    tierClass: 'base'
  };
}

function getProgressTier(referrals) {
  if (referrals >= 200) {
    return {
      tier: 'High Momentum',
      note: 'Diamond referral milestone reached. Aim for Rank #1 to become Champion.',
      levelClass: 'level-diamond'
    };
  }
  if (referrals >= 100) {
    return {
      tier: 'Growth Momentum',
      note: 'Gold referral milestone reached. Next milestone is Diamond at 200 referrals.',
      levelClass: 'level-gold'
    };
  }
  if (referrals >= 50) {
    return {
      tier: 'Foundation Momentum',
      note: 'Building toward the Gold milestone at 100 validated referrals.',
      levelClass: 'level-base'
    };
  }
  return {
    tier: 'Kickoff Momentum',
    note: 'Early campaign stage. Increase weekly referrals to unlock Gold at 100 referrals.',
    levelClass: 'level-nonqual'
  };
}

function getMonthBucketIndex(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return -1;
  const year = date.getFullYear();
  const month = date.getMonth();
  if (year === 2026 && month >= 7 && month <= 11) {
    return month - 7;
  }
  if (year === 2027 && month === 0) {
    return 5;
  }
  return -1;
}

function buildMonthlyPerformanceFromWeeklyEntries(weeklyEntries) {
  const monthly = [0, 0, 0, 0, 0, 0];
  (weeklyEntries || []).forEach((entry) => {
    const index = getMonthBucketIndex(entry.startISO);
    if (index < 0) return;
    monthly[index] += Number(entry.count || 0);
  });
  return monthly;
}

function getCurrentOrganization(state, user) {
  return state.organizations.find((org) => org.id === user.organizationId) || state.organizations[0];
}

function getDashboardOrganization(state, currentUser) {
  if (currentUser.role !== 'admin') {
    return getCurrentOrganization(state, currentUser);
  }
  if (!adminDashboardOrgId) {
    adminDashboardOrgId = state.organizations[0]?.id || null;
  }
  return state.organizations.find((org) => org.id === adminDashboardOrgId) || state.organizations[0];
}

function buildWeekRanges2026() {
  const ranges = [];
  const start = new Date(2026, 7, 3);
  const cutoff = new Date(2026, 11, 27);
  let cursor = new Date(start);
  while (cursor <= cutoff) {
    const end = new Date(cursor);
    end.setDate(cursor.getDate() + 6);
    const label = `${cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    ranges.push({
      key: cursor.toISOString().slice(0, 10),
      startISO: cursor.toISOString().slice(0, 10),
      endISO: end.toISOString().slice(0, 10),
      label
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return ranges;
}

function recomputeOrgTotals(org) {
  const weeklyTotal = (org.weeklyEntries || []).reduce((sum, entry) => sum + Number(entry.count || 0), 0);
  org.qualifiedReferrals = (Number(org.seedReferrals) || 0) + weeklyTotal;
  const sortedEntries = [...(org.weeklyEntries || [])].sort((a, b) => new Date(a.startISO) - new Date(b.startISO));
  org.weeklyReferrals = sortedEntries.length ? Number(sortedEntries[sortedEntries.length - 1].count || 0) : 0;
  org.monthlyPerformance = buildMonthlyPerformanceFromWeeklyEntries(org.weeklyEntries || []);
  org.trend = buildTrend(org.qualifiedReferrals);
}

function buildTrendChart(values) {
  const width = 280;
  const height = 150;
  const padding = 28;
  const safeValues = values.length ? values : [0, 0, 0, 0, 0, 0];
  const max = Math.max(...safeValues, 1);
  const stepX = safeValues.length > 1 ? (width - padding * 2) / (safeValues.length - 1) : width / 2;
  const points = safeValues.map((value, index) => {
    const x = padding + index * stepX;
    const y = height - padding - (value / max) * (height - padding * 2);
    return { x, y, value };
  });
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
  const yTicks = [0, Math.round(max / 2), max];
  const yLabels = yTicks.map((tick) => `<text x="8" y="${height - padding - (tick / max) * (height - padding * 2) + 4}" class="axis-label">${tick}</text>`).join('');
  const monthLabels = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'];
  const xLabels = monthLabels.slice(0, safeValues.length).map((month, index) => `<text x="${padding + index * stepX}" y="${height - 8}" text-anchor="middle" class="axis-label">${month}</text>`).join('');
  return `
    <svg viewBox="0 0 ${width} ${height}" class="sparkline" aria-label="Referral trend">
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="axis" />
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" class="axis" />
      <line x1="${padding}" y1="${height - padding - (height - padding * 2) / 2}" x2="${width - padding}" y2="${height - padding - (height - padding * 2) / 2}" class="grid" />
      <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" class="grid" />
      ${yLabels}
      ${xLabels}
      <polyline points="${linePoints}" class="line" />
      ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4.5" class="dot" />`).join('')}
    </svg>
  `;
}

function renderTrendChart(container, values, label) {
  if (!container) return;
  const safeValues = values.length ? values : [0, 0, 0, 0, 0, 0];
  container.innerHTML = `
    <div class="chart-card-inner">
      <p class="muted">${label}</p>
      ${buildTrendChart(safeValues)}
      <div class="pill">${safeValues[safeValues.length - 1]} referrals</div>
    </div>
  `;
}

function renderCampaignCountdown() {
  const target = document.getElementById('campaignCountdown');
  if (!target) return;
  const end = new Date(CAMPAIGN_END_ISO).getTime();

  const tick = () => {
    const now = Date.now();
    const diff = end - now;
    if (diff <= 0) {
      target.textContent = 'Campaign has ended.';
      return;
    }
    const day = 1000 * 60 * 60 * 24;
    const hour = 1000 * 60 * 60;
    const minute = 1000 * 60;
    const days = Math.floor(diff / day);
    const hours = Math.floor((diff % day) / hour);
    const minutes = Math.floor((diff % hour) / minute);
    target.textContent = `${days} days, ${hours} hours, ${minutes} minutes remaining`;
  };

  tick();
  window.setInterval(tick, 60000);
}

function getReferralPayoutText(organization, rank) {
  const reward = getAwardData(organization, rank);
  return `${reward.tier}: ${reward.payoutText}`;
}

function setDashboardMetricAccent(organization, rank) {
  const nextTier = document.getElementById('nextTierValue');
  const payout = document.getElementById('estimatedPayout');
  const verification = document.getElementById('verificationStatus');
  if (!nextTier || !payout || !verification) return;

  [nextTier, payout, verification].forEach((element) => {
    element.classList.remove('metric-value-warn', 'metric-value-success', 'metric-value-info', 'metric-value-danger');
  });

  if (organization.verificationStatus === 'rejected') {
    verification.classList.add('metric-value-danger');
  } else if (!organization.referralCode) {
    verification.classList.add('metric-value-warn');
  } else {
    verification.classList.add('metric-value-success');
  }

  if (rank === 1 || organization.qualifiedReferrals >= 200) {
    nextTier.classList.add('metric-value-info');
    payout.classList.add('metric-value-success');
  } else if (organization.qualifiedReferrals >= 100) {
    nextTier.classList.add('metric-value-info');
    payout.classList.add('metric-value-info');
  } else {
    nextTier.classList.add('metric-value-warn');
    payout.classList.add('metric-value-warn');
  }
}

function renderDashboardProfileTable(state, organization) {
  const body = document.getElementById('dashboardReferralProfileBody');
  if (!body || !organization) return;
  const created = organization.createdAt ? new Date(organization.createdAt) : new Date();
  const profile = organization.profile || {};
  const shopeePayShot = profile.shopeePayScreenshotData
    ? `<a href="${profile.shopeePayScreenshotData}" target="_blank" rel="noreferrer">View</a>`
    : (profile.shopeePayScreenshotName || '-');
  body.innerHTML = `
    <tr>
      <td><input type="checkbox" checked disabled /></td>
      <td>${created.toLocaleString()}</td>
      <td>${organization.referralCode || 'Unassigned'}</td>
      <td>${organization.name || '-'}</td>
      <td>${organization.email || '-'}</td>
      <td>${profile.contactPerson || '-'}</td>
      <td>${profile.contactPosition || '-'}</td>
      <td>${profile.contactNumber || '-'}</td>
      <td>${profile.shopeeUsername || '-'}</td>
      <td>${shopeePayShot}</td>
    </tr>
  `;
}

function renderInquiryThread(state, organizationId) {
  const thread = document.getElementById('inquiryThread');
  if (!thread || !organizationId) return;

  const entries = (state.inquiries || [])
    .filter((inquiry) => inquiry.type !== 'password-help' && inquiry.orgId === organizationId)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  if (!entries.length) {
    thread.innerHTML = '<div class="thread-item"><p class="muted">No inquiries yet for this organization.</p></div>';
    return;
  }

  thread.innerHTML = entries.map((inquiry) => {
    const asked = new Date(inquiry.createdAt || Date.now()).toLocaleString();
    const statusLabel = inquiry.status === 'resolved' ? 'Resolved' : 'Pending';
    const responseHistory = Array.isArray(inquiry.responses)
      ? inquiry.responses
      : (inquiry.response
        ? [{ message: inquiry.response, createdAt: inquiry.repliedAt || inquiry.createdAt || new Date().toISOString() }]
        : []);

    const responseMarkup = responseHistory.length
      ? responseHistory.map((responseEntry) => `
          <div class="thread-reply">
            <p><strong>Admin response:</strong> ${responseEntry.message}</p>
            <p class="thread-meta">Replied ${new Date(responseEntry.createdAt || Date.now()).toLocaleString()}</p>
          </div>
        `).join('')
      : '<p class="thread-meta">Awaiting admin response.</p>';

    return `
      <div class="thread-item">
        <p><strong>Your inquiry:</strong> ${inquiry.message}</p>
        <p class="thread-meta">Status: ${statusLabel} · Sent ${asked}</p>
        ${responseMarkup}
      </div>
    `;
  }).join('');
}

function renderDashboard(state) {
  const currentUser = getCurrentUser(state);
  if (!currentUser) return;

  const organization = getDashboardOrganization(state, currentUser);
  const adminWrap = document.getElementById('adminDashboardOrgWrap');
  const adminSelect = document.getElementById('adminDashboardOrgSelect');
  const noticeBar = document.getElementById('dashboardNoticeBar');
  const rank = state.organizations.slice().sort((a, b) => b.qualifiedReferrals - a.qualifiedReferrals).findIndex((org) => org.id === organization.id) + 1;
  const award = getAwardData(organization, rank);
  const roadshow = getRoadshowQualification(rank);

  const dashboardName = currentUser.role === 'admin'
    ? currentUser.name
    : ((organization.profile?.contactPerson || '').trim() || currentUser.name);
  document.getElementById('userName').textContent = dashboardName;
  document.getElementById('orgName').textContent = organization.name;
  if (currentUser.role === 'admin' && adminWrap && adminSelect) {
    adminWrap.style.display = 'inline-block';
    adminSelect.innerHTML = state.organizations
      .map((org) => `<option value="${org.id}">${org.name} (${org.referralCode ? 'code assigned' : 'awaiting code'})</option>`)
      .join('');
    adminSelect.value = String(organization.id);
    adminSelect.onchange = () => {
      adminDashboardOrgId = Number(adminSelect.value);
      renderDashboard(state);
    };
  } else if (adminWrap) {
    adminWrap.style.display = 'none';
  }

  document.getElementById('overallReferrals').textContent = organization.qualifiedReferrals;
  document.getElementById('tierValue').textContent = award.tier;
  document.getElementById('weeklyReferrals').textContent = organization.weeklyReferrals;
  const referrals = Number(organization.qualifiedReferrals || 0);
  const nextTier = rank === 1
    ? 'Champion status secured at Rank #1'
    : referrals >= 200
      ? 'Diamond tier reached. Push for Rank #1 to secure Champion reward.'
      : referrals >= 100
        ? `Need ${Math.max(0, 200 - referrals)} more referrals to reach Diamond tier`
        : `Need ${Math.max(0, 100 - referrals)} more referrals to reach Gold tier`;
  document.getElementById('nextTierValue').textContent = nextTier;
  document.getElementById('estimatedPayout').textContent = getReferralPayoutText(organization, rank);
  const roadshowNode = document.getElementById('roadshowStatus');
  if (roadshowNode) {
    roadshowNode.textContent = `${roadshow.type} · ${roadshow.summary}`;
    roadshowNode.classList.toggle('metric-value-success', roadshow.eligible);
    roadshowNode.classList.toggle('metric-value-warn', !roadshow.eligible);
  }
  document.getElementById('verificationStatus').textContent = organization.verificationStatus === 'rejected'
    ? `Verification issue: ${organization.rejectionReason || 'Please contact admin.'}`
    : organization.referralCode
      ? 'Email verified and referral code assigned'
      : 'Email verified. Referral code assignment is in progress';
  const progressMeta = getProgressTier(organization.qualifiedReferrals);
  const progressFill = document.getElementById('progressFill');
  progressFill.style.width = `${Math.min(100, Math.round((organization.qualifiedReferrals / 250) * 100))}%`;
  progressFill.className = progressMeta.levelClass;
  document.getElementById('overallProgressLabel').textContent = `${organization.qualifiedReferrals} referrals · ${progressMeta.tier}`;
  document.getElementById('progressTierNote').textContent = progressMeta.note;

  const referralStatusCard = document.getElementById('referralStatusCard');
  if (referralStatusCard) {
    referralStatusCard.innerHTML = `
      <div class="pill">${organization.name}</div>
      <p><strong>${organization.qualifiedReferrals}</strong> qualified referrals</p>
      <p><strong>${award.tier}</strong> · ${award.reward}</p>
      <p class="muted">${award.highlight}</p>
    `;
  }

  const referralCodeNode = document.getElementById('orgReferralCode');
  if (referralCodeNode) {
    referralCodeNode.textContent = organization.referralCode || 'Your email is verified. Please wait while the admin team assigns your referral code.';
    referralCodeNode.classList.toggle('referral-code-pending-copy', !organization.referralCode);
  }

  if (noticeBar) {
    const latestNotice = Array.isArray(organization.notifications) ? organization.notifications[0] : null;
    if (latestNotice?.message) {
      noticeBar.classList.remove('hidden');
      noticeBar.textContent = latestNotice.message;
    } else {
      noticeBar.classList.add('hidden');
      noticeBar.textContent = '';
    }
  }

  setDashboardMetricAccent(organization, rank);
  renderDashboardProfileTable(state, organization);
  renderInquiryThread(state, organization.id);
}

function renderLeaderboard(state) {
  const tbody = document.getElementById('leaderboardBody');
  const summary = document.getElementById('awardSummary');
  if (!tbody) return;

  const rankedOrganizations = [...state.organizations]
    .sort((a, b) => b.qualifiedReferrals - a.qualifiedReferrals)
    .map((org, index) => ({ ...org, rank: index + 1, award: getAwardData(org, index + 1) }));

  tbody.innerHTML = rankedOrganizations.map((org) => `
    <tr>
      <td>#${org.rank}</td>
      <td><strong>${org.name}</strong></td>
      <td>${org.university}</td>
      <td>${org.qualifiedReferrals}</td>
      <td><span class="tier-badge ${org.award.tierClass}">${org.award.tier}</span></td>
    </tr>
  `).join('');

  if (summary) {
    const topOrg = rankedOrganizations[0];
    summary.innerHTML = `
      <p><strong>${topOrg.name}</strong> leads the leaderboard with ${topOrg.qualifiedReferrals} qualified referrals.</p>
    `;
  }
}

function openOrganizationModal(state, org) {
  const modal = document.getElementById('orgModal');
  if (!modal) return;
  const rank = state.organizations.slice().sort((a, b) => b.qualifiedReferrals - a.qualifiedReferrals).findIndex((entry) => entry.id === org.id) + 1;
  const award = getAwardData(org, rank);
  modal.innerHTML = `
    <div class="modal-card">
      <h2>${org.name}</h2>
      <p class="muted">${org.university} · ${org.referralCode}</p>
      <div class="stats-grid modal-stats">
        <article class="card stat-card">
          <h3>Referrals</h3>
          <p class="stat-value">${org.qualifiedReferrals}</p>
        </article>
        <article class="card stat-card">
          <h3>Weekly</h3>
          <p class="stat-value">${org.weeklyReferrals}</p>
        </article>
        <article class="card stat-card">
          <h3>Tier</h3>
          <p class="stat-value">${award.tier}</p>
        </article>
      </div>
      ${buildTrendChart(org.trend || buildTrend(org.qualifiedReferrals))}
      <div class="card">
        <h3>Overview</h3>
        <p>${award.reward}</p>
        <p class="muted">${award.highlight}</p>
      </div>
      <div class="button-group" style="margin-top: 16px; display:flex; gap:10px;">
        <button class="button secondary" type="button" onclick="document.getElementById('orgModal').classList.add('hidden')">Close</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

function getMonthlySeries(org) {
  if (Array.isArray(org.monthlyPerformance) && org.monthlyPerformance.length === 6) {
    return org.monthlyPerformance;
  }
  if (Array.isArray(org.weeklyEntries) && org.weeklyEntries.length) {
    return buildMonthlyPerformanceFromWeeklyEntries(org.weeklyEntries);
  }
  return org.trend || buildTrend(org.qualifiedReferrals);
}

function openMonthModal(state, monthIndex) {
  const modal = document.getElementById('orgModal');
  if (!modal) return;
  const monthLabels = ['August', 'September', 'October', 'November', 'December', 'January'];
  const monthLabel = monthLabels[monthIndex] || 'Month';
  const ranked = state.organizations
    .map((org) => ({ org, value: getMonthlySeries(org)[monthIndex] || 0 }))
    .sort((a, b) => b.value - a.value);

  modal.innerHTML = `
    <div class="modal-card">
      <h2>${monthLabel} performance</h2>
      <p class="muted">Organizations with the strongest referral performance for ${monthLabel.toLowerCase()}.</p>
      <div class="mission-list">
        ${ranked.map(({ org, value }) => `
          <div class="mission-item">
            <span><strong>${org.name}</strong><br />${org.university}</span>
            <span class="pill">${value} referrals</span>
          </div>
        `).join('')}
      </div>
      <div class="button-group" style="margin-top: 16px; display:flex; gap:10px;">
        <button class="button secondary" type="button" onclick="document.getElementById('orgModal').classList.add('hidden')">Close</button>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
}

function renderAdmin(state) {
  state.referralDirectory = normalizeReferralDirectory(state.referralDirectory, state.organizations);
  document.getElementById('adminOrgCount').textContent = state.organizations.length;
  document.getElementById('adminReferralCount').textContent = state.organizations.reduce((sum, org) => sum + org.qualifiedReferrals, 0);
  document.getElementById('adminPendingCount').textContent = state.organizations.filter((org) => !org.referralCode).length;

  const monthlyStats = document.getElementById('monthlyStats');
  if (monthlyStats) {
    monthlyStats.innerHTML = '';
    ['August', 'September', 'October', 'November', 'December', 'January'].forEach((month, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'mission-item month-item';
      const value = state.organizations.reduce((sum, org) => sum + (getMonthlySeries(org)[index] || 0), 0);
      item.innerHTML = `<span>${month} 2026</span><span class="pill">${value} referrals</span>`;
      item.addEventListener('click', () => openMonthModal(state, index));
      monthlyStats.appendChild(item);
    });
  }

  const orgSelectList = document.getElementById('organizationSelectList');
  if (orgSelectList) {
    orgSelectList.innerHTML = '';
    if (!adminSelectedOrgId) {
      adminSelectedOrgId = state.organizations[0]?.id || null;
    }
    state.organizations.forEach((org) => {
      const award = getAwardData(org, state.organizations.slice().sort((a, b) => b.qualifiedReferrals - a.qualifiedReferrals).findIndex((entry) => entry.id === org.id) + 1);
      const entry = document.createElement('button');
      entry.type = 'button';
      entry.className = 'org-select-item';
      if (org.id === adminSelectedOrgId) {
        entry.style.borderWidth = '2px';
        entry.style.borderColor = '#1d4ed8';
      }
      entry.innerHTML = `
        <div class="org-progress-row">
          <strong>${org.name}</strong>
          <span class="tier-badge ${award.tierClass}">${award.tier}</span>
        </div>
        <div class="org-progress-row">
          <span>${org.qualifiedReferrals} referrals · ${org.university}</span>
        </div>
        <div class="org-progress-row">
          <span class="pill">Code: ${org.referralCode}</span>
        </div>
      `;
      entry.addEventListener('click', () => {
        adminSelectedOrgId = org.id;
        renderAdmin(state);
      });
      entry.addEventListener('dblclick', () => openOrganizationModal(state, org));
      orgSelectList.appendChild(entry);
    });
  }

  const inquiryFilterBar = document.getElementById('inquiryFilterBar');
  const inquiryList = document.getElementById('inquiryList');
  if (inquiryFilterBar && inquiryList) {
    const pendingCount = state.inquiries.filter((inquiry) => inquiry.status !== 'resolved').length;
    const resolvedCount = state.inquiries.filter((inquiry) => inquiry.status === 'resolved').length;
    inquiryFilterBar.innerHTML = `
      <span class="pill">Inquiry status</span>
      <button type="button" class="button ghost small" data-inquiry-filter="pending">Pending (${pendingCount})</button>
      <button type="button" class="button ghost small" data-inquiry-filter="resolved">Resolved (${resolvedCount})</button>
      <button type="button" class="button ghost small" data-inquiry-filter="all">All (${state.inquiries.length})</button>
    `;

    inquiryFilterBar.querySelectorAll('button[data-inquiry-filter]').forEach((button) => {
      if (button.dataset.inquiryFilter === adminInquiryFilter) {
        button.style.borderColor = '#1d4ed8';
        button.style.color = '#1d4ed8';
      }
      button.addEventListener('click', () => {
        adminInquiryFilter = button.dataset.inquiryFilter;
        renderAdmin(state);
      });
    });

    let filteredInquiries = [...state.inquiries];
    if (adminInquiryFilter === 'pending') {
      filteredInquiries = filteredInquiries.filter((inquiry) => inquiry.status !== 'resolved');
    } else if (adminInquiryFilter === 'resolved') {
      filteredInquiries = filteredInquiries.filter((inquiry) => inquiry.status === 'resolved');
    }

    inquiryList.innerHTML = '';
    if (filteredInquiries.length === 0) {
      inquiryList.innerHTML = '<div class="mission-item"><span>No inquiries in this category.</span></div>';
    } else {
      filteredInquiries.forEach((inquiry) => {
        const entry = document.createElement('div');
        entry.className = 'mission-item admin-inquiry-item';
        const statusClass = inquiry.status === 'resolved' ? 'approved' : 'pending';
        const statusLabel = inquiry.status === 'resolved' ? 'resolved' : 'pending';
        if (inquiry.type === 'password-help') {
          entry.innerHTML = `
            <p><strong>Password recovery request</strong></p>
            <p>Email: ${inquiry.email}<br />Contact person: ${inquiry.contactPerson}<br />Contact number: ${inquiry.contactNumber}<br />${inquiry.message || 'No additional message.'}</p>
            <div class="admin-inquiry-controls">
              <span class="referral-status-pill ${statusClass}">${statusLabel}</span>
              <button type="button" class="button ghost small" data-inquiry-status-id="${inquiry.id}" data-next-status="${inquiry.status === 'resolved' ? 'pending' : 'resolved'}">${inquiry.status === 'resolved' ? 'Mark pending' : 'Mark resolved'}</button>
            </div>
          `;
        } else {
          const repliedTag = inquiry.response
            ? `<p class="thread-meta">Current reply: ${inquiry.response}</p>`
            : '<p class="thread-meta">No response sent yet.</p>';
          entry.innerHTML = `
            <p><strong>${inquiry.orgLabel || inquiry.orgName}</strong></p>
            <p>${inquiry.message}</p>
            ${repliedTag}
            <div class="admin-inquiry-controls">
              <span class="referral-status-pill ${statusClass}">${statusLabel}</span>
              <button type="button" class="button ghost small" data-inquiry-status-id="${inquiry.id}" data-next-status="${inquiry.status === 'resolved' ? 'pending' : 'resolved'}">${inquiry.status === 'resolved' ? 'Mark pending' : 'Mark resolved'}</button>
            </div>
            <div class="admin-inquiry-reply">
              <textarea id="inquiryReplyInput-${inquiry.id}" rows="3" placeholder="Write a response for this inquiry">${inquiry.response || ''}</textarea>
              <button type="button" class="button primary small" data-inquiry-reply-id="${inquiry.id}">Send response</button>
            </div>
          `;
        }
        inquiryList.appendChild(entry);
      });

      inquiryList.querySelectorAll('button[data-inquiry-status-id]').forEach((button) => {
        button.addEventListener('click', () => {
          const inquiryId = Number(button.dataset.inquiryStatusId);
          const nextStatus = button.dataset.nextStatus === 'resolved' ? 'resolved' : 'pending';
          const targetInquiry = state.inquiries.find((item) => item.id === inquiryId);
          if (!targetInquiry) return;
          targetInquiry.status = nextStatus;
          saveState(state);
          renderAdmin(state);
        });
      });

      inquiryList.querySelectorAll('button[data-inquiry-reply-id]').forEach((button) => {
        button.addEventListener('click', () => {
          const inquiryId = Number(button.dataset.inquiryReplyId);
          const textArea = document.getElementById(`inquiryReplyInput-${inquiryId}`);
          const response = (textArea?.value || '').trim();
          if (!response) {
            window.alert('Please enter a response before sending.');
            return;
          }
          const targetInquiry = state.inquiries.find((item) => item.id === inquiryId);
          if (!targetInquiry) return;
          if (!Array.isArray(targetInquiry.responses)) {
            targetInquiry.responses = [];
          }
          const repliedAt = new Date().toISOString();
          targetInquiry.responses.push({
            id: Date.now(),
            message: response,
            createdAt: repliedAt
          });
          targetInquiry.response = response;
          targetInquiry.repliedAt = repliedAt;
          saveState(state);
          renderAdmin(state);
        });
      });
    }
  }

  renderAdminReferralsPanel(state);
  renderReferralDirectoryManager(state);
  renderWeeklyEncoder(state, getSelectedOrganization(state)?.id || null);
}

function renderWeeklyEncoder(state, preferredOrgId = null) {
  const orgSelect = document.getElementById('weeklyOrgSelect');
  const weekSelect = document.getElementById('weeklyRangeSelect');
  const status = document.getElementById('weeklyReferralStatus');
  const list = document.getElementById('weeklyEntryList');
  if (!orgSelect || !weekSelect || !list) return;

  const currentValue = Number(orgSelect.value || 0);
  const fallback = getSelectedOrganization(state);
  const selectedOrgId = preferredOrgId || currentValue || fallback?.id || state.organizations[0]?.id;
  orgSelect.innerHTML = state.organizations
    .map((org) => `<option value="${org.id}">${org.name}</option>`)
    .join('');
  orgSelect.value = String(selectedOrgId || '');

  const ranges = buildWeekRanges2026();
  weekSelect.innerHTML = ranges
    .map((range) => `<option value="${range.key}">${range.label}</option>`)
    .join('');

  const activeOrg = state.organizations.find((org) => org.id === Number(orgSelect.value));
  if (!activeOrg) return;
  const entries = [...(activeOrg.weeklyEntries || [])].sort((a, b) => new Date(a.startISO) - new Date(b.startISO));

  if (entries.length === 0) {
    list.innerHTML = '<div class="mission-item"><span>No weekly entries yet.</span></div>';
  } else {
    list.innerHTML = entries.map((entry) => `
      <div class="mission-item weekly-entry-item">
        <span><strong>${activeOrg.name}</strong><br />${entry.label}</span>
        <div class="weekly-entry-actions">
          <span class="pill">${entry.count} referrals</span>
          <button type="button" class="button ghost small" data-weekly-edit-key="${entry.key}" data-weekly-org-id="${activeOrg.id}">Edit</button>
          <button type="button" class="button ghost small danger" data-weekly-delete-key="${entry.key}" data-weekly-org-id="${activeOrg.id}">Delete</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('button[data-weekly-edit-key]').forEach((button) => {
      button.addEventListener('click', () => {
        const orgId = Number(button.dataset.weeklyOrgId);
        const key = button.dataset.weeklyEditKey;
        const selectedOrg = state.organizations.find((org) => org.id === orgId);
        const selectedEntry = selectedOrg?.weeklyEntries?.find((entry) => entry.key === key);
        if (!selectedOrg || !selectedEntry) return;
        orgSelect.value = String(orgId);
        weekSelect.value = selectedEntry.key;
        document.getElementById('weeklyReferralCount').value = String(selectedEntry.count);
        if (status) {
          status.textContent = `Editing ${selectedOrg.name} (${selectedEntry.label}). Update referrals then click Save weekly referrals.`;
        }
      });
    });

    list.querySelectorAll('button[data-weekly-delete-key]').forEach((button) => {
      button.addEventListener('click', () => {
        const orgId = Number(button.dataset.weeklyOrgId);
        const key = button.dataset.weeklyDeleteKey;
        const selectedOrg = state.organizations.find((org) => org.id === orgId);
        if (!selectedOrg) return;
        const selectedEntry = selectedOrg.weeklyEntries?.find((entry) => entry.key === key);
        if (!selectedEntry) return;
        const proceed = window.confirm(`Delete weekly entry for ${selectedOrg.name} (${selectedEntry.label})?`);
        if (!proceed) return;
        selectedOrg.weeklyEntries = (selectedOrg.weeklyEntries || []).filter((entry) => entry.key !== key);
        recomputeOrgTotals(selectedOrg);
        saveState(state);
        if (status) {
          status.textContent = `Deleted weekly entry for ${selectedOrg.name} (${selectedEntry.label}).`;
        }
        renderAdmin(state);
      });
    });
  }

}

function handleWeeklyReferralEntry(state, event) {
  event.preventDefault();
  const orgId = Number(document.getElementById('weeklyOrgSelect')?.value || 0);
  const weekKey = document.getElementById('weeklyRangeSelect')?.value;
  const count = Number(document.getElementById('weeklyReferralCount')?.value || 0);
  const status = document.getElementById('weeklyReferralStatus');
  const org = state.organizations.find((entry) => entry.id === orgId);
  const range = buildWeekRanges2026().find((entry) => entry.key === weekKey);

  if (!org || !range || !Number.isFinite(count) || count < 0) {
    if (status) status.textContent = 'Please choose a valid organization, week, and referral count.';
    return;
  }

  const existing = org.weeklyEntries.find((entry) => entry.key === weekKey);
  if (existing) {
    existing.count = count;
  } else {
    org.weeklyEntries.push({
      key: weekKey,
      label: range.label,
      startISO: range.startISO,
      endISO: range.endISO,
      count
    });
  }

  recomputeOrgTotals(org);
  saveState(state);
  if (status) {
    status.textContent = `Saved ${count} referrals for ${org.name} (${range.label}).`;
  }
  document.getElementById('weeklyReferralCount').value = '';
  adminSelectedOrgId = org.id;
  if (adminDashboardOrgId === null) {
    adminDashboardOrgId = org.id;
  }
  renderAdmin(state);
}

function getSelectedOrganization(state) {
  return state.organizations.find((org) => org.id === adminSelectedOrgId) || state.organizations[0] || null;
}

function getFilteredReferrals(state) {
  const all = [...state.organizations].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  if (adminReferralFilter === 'all') return all;
  if (adminReferralFilter === 'assigned-code') {
    return all.filter((org) => Boolean(org.referralCode));
  }
  return all.filter((org) => !org.referralCode);
}

function upsertDirectoryEntry(state, name, code, skipEntryId = null) {
  const cleanName = (name || '').trim();
  const cleanCode = sanitizeReferralCode(code);
  if (!cleanName || !cleanCode) {
    return { ok: false, message: 'Organization name and referral code are required.' };
  }

  const skipId = Number(skipEntryId) || null;
  const duplicate = (state.referralDirectory || []).find((entry) => (
    sanitizeReferralCode(entry.code) === cleanCode
    && Number(entry.id) !== skipId
  ));
  if (duplicate) {
    return { ok: false, message: `Referral code already exists for ${duplicate.name}.` };
  }

  if (!Array.isArray(state.referralDirectory)) {
    state.referralDirectory = [];
  }

  if (skipEntryId) {
    const target = state.referralDirectory.find((entry) => entry.id === skipEntryId);
    if (!target) {
      return { ok: false, message: 'The selected entry could not be found.' };
    }
    target.name = cleanName;
    target.code = cleanCode;
    return { ok: true, entry: target, updated: true };
  }

  const nextId = (state.referralDirectory || []).reduce((maxId, entry) => Math.max(maxId, Number(entry.id) || 0), 0) + 1;
  const entry = { id: nextId, name: cleanName, code: cleanCode };
  state.referralDirectory.push(entry);
  return { ok: true, entry, updated: false };
}

function syncOrganizationCodeToDirectory(state, organization) {
  if (!organization?.referralCode) return;
  const existing = (state.referralDirectory || []).find((entry) => entry.code === organization.referralCode);
  if (existing) return;
  upsertDirectoryEntry(state, organization.name, organization.referralCode);
}

function addOrganizationNotice(organization, message) {
  if (!organization || !message) return;
  if (!Array.isArray(organization.notifications)) {
    organization.notifications = [];
  }
  organization.notifications.unshift({
    id: Date.now(),
    message,
    createdAt: new Date().toISOString()
  });
  organization.notifications = organization.notifications.slice(0, 12);
}

function assignReferralCodeToOrganization(state, organization, code) {
  if (!state || !organization) {
    return { ok: false, message: 'Organization not found.' };
  }
  const cleanCode = sanitizeReferralCode(code);
  if (!cleanCode) {
    return { ok: false, message: 'Invalid referral code.' };
  }

  const previousCode = organization.referralCode || '';
  organization.referralCode = cleanCode;
  organization.verificationStatus = 'verified';
  organization.valid = true;
  organization.compliant = true;

  if (previousCode !== cleanCode) {
    addOrganizationNotice(organization, `Your referral code is now available: ${cleanCode}. You can start sharing it with your members.`);
  }

  syncOrganizationCodeToDirectory(state, organization);
  return {
    ok: true,
    code: cleanCode,
    changed: previousCode !== cleanCode
  };
}

function renderReferralDirectoryManager(state) {
  const searchInput = document.getElementById('referralDirectorySearch');
  const list = document.getElementById('referralDirectoryList');
  const pageMeta = document.getElementById('referralDirectoryPageMeta');
  const prevButton = document.getElementById('referralDirectoryPrev');
  const nextButton = document.getElementById('referralDirectoryNext');
  const form = document.getElementById('referralDirectoryForm');
  const formTitle = document.getElementById('referralDirectoryFormTitle');
  const orgInput = document.getElementById('referralDirectoryOrgName');
  const codeInput = document.getElementById('referralDirectoryCode');
  const cancelButton = document.getElementById('referralDirectoryCancelEdit');
  const status = document.getElementById('referralDirectoryStatus');
  const pendingOrgSelect = document.getElementById('referralPendingOrgSelect');
  const pendingCodeInput = document.getElementById('referralPendingCodeInput');
  const assignPendingButton = document.getElementById('assignPendingReferralCode');
  const assignOptions = document.getElementById('referralDirectoryAssignOptions');
  if (!searchInput || !list || !pageMeta || !prevButton || !nextButton || !form || !formTitle || !orgInput || !codeInput || !cancelButton || !status || !pendingOrgSelect || !pendingCodeInput || !assignPendingButton || !assignOptions) {
    return;
  }

  const query = adminReferralDirectoryQuery.trim().toLowerCase();
  const sorted = [...(state.referralDirectory || [])].sort((a, b) => a.name.localeCompare(b.name));
  const filtered = sorted.filter((entry) => {
    if (!query) return true;
    return entry.name.toLowerCase().includes(query) || entry.code.toLowerCase().includes(query);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / REFERRAL_DIRECTORY_PAGE_SIZE));
  adminReferralDirectoryPage = Math.min(totalPages, Math.max(1, adminReferralDirectoryPage));
  const start = (adminReferralDirectoryPage - 1) * REFERRAL_DIRECTORY_PAGE_SIZE;
  const visible = filtered.slice(start, start + REFERRAL_DIRECTORY_PAGE_SIZE);

  searchInput.value = adminReferralDirectoryQuery;
  pageMeta.textContent = `Page ${adminReferralDirectoryPage} of ${totalPages} (${filtered.length} entries)`;
  prevButton.disabled = adminReferralDirectoryPage <= 1;
  nextButton.disabled = adminReferralDirectoryPage >= totalPages;
  status.textContent = adminReferralDirectoryStatusMessage;

  const pendingOrganizations = state.organizations
    .filter((org) => !org.referralCode)
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  pendingOrgSelect.innerHTML = pendingOrganizations.length
    ? pendingOrganizations.map((org) => `<option value="${org.id}">${org.name}</option>`).join('')
    : '<option value="">No pending organizations</option>';

  assignOptions.innerHTML = sorted
    .map((entry) => `<option value="${entry.name} | ${entry.code}"></option>`)
    .join('');

  if (!visible.length) {
    list.innerHTML = '<div class="mission-item"><span>No referral entries found for this search.</span></div>';
  } else {
    list.innerHTML = visible.map((entry) => `
      <div class="mission-item referral-directory-item">
        <div>
          <strong>${entry.name}</strong>
          <p class="muted">${entry.code}</p>
        </div>
        <div class="button-group-inline">
          <button type="button" class="button ghost small" data-dir-action="edit" data-dir-id="${entry.id}">Edit</button>
          <button type="button" class="button ghost small danger" data-dir-action="delete" data-dir-id="${entry.id}">Delete</button>
        </div>
      </div>
    `).join('');
  }

  formTitle.textContent = adminEditingDirectoryId ? 'Edit referral entry' : 'Add referral entry';
  if (!adminEditingDirectoryId) {
    orgInput.value = '';
    codeInput.value = '';
  }

  searchInput.oninput = () => {
    adminReferralDirectoryQuery = searchInput.value;
    adminReferralDirectoryPage = 1;
    renderReferralDirectoryManager(state);
  };

  prevButton.onclick = () => {
    if (adminReferralDirectoryPage <= 1) return;
    adminReferralDirectoryPage -= 1;
    renderReferralDirectoryManager(state);
  };

  nextButton.onclick = () => {
    if (adminReferralDirectoryPage >= totalPages) return;
    adminReferralDirectoryPage += 1;
    renderReferralDirectoryManager(state);
  };

  cancelButton.onclick = () => {
    adminEditingDirectoryId = null;
    adminReferralDirectoryStatusMessage = '';
    renderReferralDirectoryManager(state);
  };

  form.onsubmit = (event) => {
    event.preventDefault();
    const previousEntry = adminEditingDirectoryId
      ? (state.referralDirectory || []).find((entry) => entry.id === adminEditingDirectoryId)
      : null;
    const previousCode = previousEntry?.code || '';
    const result = upsertDirectoryEntry(state, orgInput.value, codeInput.value, adminEditingDirectoryId);
    if (!result.ok) {
      adminReferralDirectoryStatusMessage = result.message;
      renderReferralDirectoryManager(state);
      return;
    }

    if (adminEditingDirectoryId) {
      state.organizations.forEach((org) => {
        if (org.referralCode === previousCode) {
          org.referralCode = result.entry.code;
        }
      });
      adminReferralDirectoryStatusMessage = `Updated ${result.entry.name} (${result.entry.code}).`;
    } else {
      adminReferralDirectoryStatusMessage = `Added ${result.entry.name} (${result.entry.code}).`;
    }

    adminEditingDirectoryId = null;
    saveState(state);
    renderAdmin(state);
  };

  assignPendingButton.onclick = () => {
    const orgId = Number(pendingOrgSelect.value || 0);
    const organization = state.organizations.find((org) => org.id === orgId && !org.referralCode);
    if (!organization) {
      adminReferralDirectoryStatusMessage = 'Select a pending organization first.';
      renderReferralDirectoryManager(state);
      return;
    }

    const match = findDirectoryMatch(state.referralDirectory, pendingCodeInput.value || '');
    if (!match) {
      adminReferralDirectoryStatusMessage = 'Choose a valid referral directory entry for assignment.';
      renderReferralDirectoryManager(state);
      return;
    }

    const assignment = assignReferralCodeToOrganization(state, organization, match.code);
    if (!assignment.ok) {
      adminReferralDirectoryStatusMessage = assignment.message;
      renderReferralDirectoryManager(state);
      return;
    }

    adminReferralDirectoryStatusMessage = `Assigned ${assignment.code} to ${organization.name}.`;
    saveState(state);
    renderAdmin(state);
  };

  list.querySelectorAll('button[data-dir-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const entryId = Number(button.dataset.dirId);
      const entry = (state.referralDirectory || []).find((item) => item.id === entryId);
      if (!entry) return;

      if (button.dataset.dirAction === 'edit') {
        adminEditingDirectoryId = entryId;
        orgInput.value = entry.name;
        codeInput.value = entry.code;
        adminReferralDirectoryStatusMessage = `Editing ${entry.name}.`;
        renderReferralDirectoryManager(state);
        return;
      }

      const linkedOrgs = state.organizations.filter((org) => org.referralCode === entry.code);
      let confirmMessage = `Delete referral entry ${entry.name} (${entry.code})?`;
      if (linkedOrgs.length) {
        confirmMessage += ` ${linkedOrgs.length} organization(s) currently use this code and will be set to Unassigned.`;
      }
      const proceed = window.confirm(confirmMessage);
      if (!proceed) return;

      state.referralDirectory = state.referralDirectory.filter((item) => item.id !== entryId);
      linkedOrgs.forEach((org) => {
        org.referralCode = '';
      });
      adminEditingDirectoryId = null;
      adminReferralDirectoryStatusMessage = `Deleted ${entry.name} (${entry.code}).`;
      saveState(state);
      renderAdmin(state);
    });
  });
}

function renderAdminReferralsPanel(state) {
  const toolbar = document.getElementById('adminReferralsToolbar');
  const body = document.getElementById('adminReferralBody');
  const datalist = document.getElementById('referralDirectoryOptions');
  if (!toolbar || !body) return;

  if (datalist) {
    const options = [...(state.referralDirectory || [])].sort((a, b) => a.name.localeCompare(b.name));
    datalist.innerHTML = options
      .map((entry) => `<option value="${entry.name} | ${entry.code}"></option>`)
      .join('');
  }

  const allCount = state.organizations.length;
  const pendingCount = state.organizations.filter((org) => !org.referralCode).length;
  const assignedCount = state.organizations.filter((org) => Boolean(org.referralCode)).length;
  toolbar.innerHTML = `
    <span class="pill">Referral code assignment queue</span>
    <button type="button" class="button ghost small" data-filter="awaiting-code">Awaiting code (${pendingCount})</button>
    <button type="button" class="button ghost small" data-filter="assigned-code">Assigned code (${assignedCount})</button>
    <button type="button" class="button ghost small" data-filter="all">All (${allCount})</button>
  `;

  toolbar.querySelectorAll('button[data-filter]').forEach((button) => {
    if (button.dataset.filter === adminReferralFilter) {
      button.style.borderColor = '#1d4ed8';
      button.style.color = '#1d4ed8';
    }
    button.addEventListener('click', () => {
      adminReferralFilter = button.dataset.filter;
      renderAdminReferralsPanel(state);
    });
  });

  const rows = getFilteredReferrals(state);
  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="12">No organization profiles in this view.</td></tr>';
    return;
  }

  body.innerHTML = rows.map((org) => {
    const profile = org.profile || {};
    const payShot = profile.shopeePayScreenshotData
      ? `<a href="${profile.shopeePayScreenshotData}" target="_blank" rel="noreferrer">View</a>`
      : (profile.shopeePayScreenshotName || '-');
    const status = org.referralCode ? 'approved' : 'pending';
    return `
    <tr>
      <td><input type="checkbox" class="ref-select" data-org-id="${org.id}" /></td>
      <td>${new Date(org.createdAt || Date.now()).toLocaleString()}</td>
      <td>${org.referralCode || 'Unassigned'}</td>
      <td>${org.name}</td>
      <td>${org.email || '-'}</td>
      <td>${profile.contactPerson || '-'}</td>
      <td>${profile.contactPosition || '-'}</td>
      <td>${profile.contactNumber || '-'}</td>
      <td>${profile.shopeeUsername || '-'}</td>
      <td>${payShot}</td>
      <td><span class="referral-status-pill ${status}">${org.referralCode ? 'code assigned' : 'awaiting code'}</span></td>
      <td>
        <div class="admin-action-stack">
          <label class="assign-code-wrap">
            <select class="referral-assign-select" data-org-id="${org.id}">${buildReferralDirectorySelectMarkup(state.referralDirectory, org.referralCode)}</select>
          </label>
          <button type="button" class="button ghost small" data-action="assign-code" data-org-id="${org.id}">Assign selected code</button>
          <button type="button" class="button ghost small" data-action="reset-password" data-org-id="${org.id}">Reset password</button>
          <button type="button" class="button ghost small danger" data-action="delete" data-org-id="${org.id}">Delete</button>
        </div>
      </td>
    </tr>
  `;
  }).join('');

  body.querySelectorAll('button[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const orgId = Number(button.dataset.orgId);
      const organization = state.organizations.find((item) => item.id === orgId);
      if (!organization) return;
      if (button.dataset.action === 'assign-code') {
        const assignSelect = body.querySelector(`.referral-assign-select[data-org-id="${orgId}"]`);
        const entry = findDirectoryMatch(state.referralDirectory, assignSelect?.value || '');
        if (!entry) {
          window.alert('Select a referral code from the dropdown before assigning it.');
          return;
        }
        const assignment = assignReferralCodeToOrganization(state, organization, entry.code);
        if (!assignment.ok) {
          window.alert(assignment.message || 'Unable to assign code right now.');
          return;
        }
      } else if (button.dataset.action === 'reset-password') {
        openAdminPasswordResetModal(state, orgId);
        return;
      } else if (button.dataset.action === 'delete') {
        const proceed = window.confirm(`Delete ${organization.name}? This will remove the registration profile and org account.`);
        if (!proceed) {
          return;
        }
        state.organizations = state.organizations.filter((item) => item.id !== orgId);
        state.users = state.users.filter((user) => user.role !== 'organization' || user.organizationId !== orgId);
        state.inquiries = state.inquiries.filter((inquiry) => inquiry.orgId !== orgId);
        if (state.currentUserId) {
          const active = state.users.find((user) => user.id === state.currentUserId);
          if (!active) {
            state.currentUserId = null;
          }
        }
        if (adminSelectedOrgId === orgId) {
          adminSelectedOrgId = state.organizations[0]?.id || null;
        }
      }
      saveState(state);
      renderAdmin(state);
      renderAdminReferralsPanel(state);
    });
  });
}

async function copyReferrals(state, selectedOnly) {
  const visibleRows = getFilteredReferrals(state);
  let rows = visibleRows;
  if (selectedOnly) {
    const selectedIds = Array.from(document.querySelectorAll('.ref-select:checked')).map((box) => Number(box.dataset.orgId));
    rows = visibleRows.filter((item) => selectedIds.includes(item.id));
  }

  if (rows.length === 0) {
    window.alert('No referral rows to copy in the current view.');
    return;
  }

  const header = ['Created', 'Referral', 'Organization Name', 'Organization Email', 'Contact Person', 'Position', 'Contact Number', 'Shopee Username', 'Status'];
  const lines = rows.map((row) => [
    new Date(row.createdAt || Date.now()).toLocaleString(),
    row.referralCode || '-',
    row.name,
    row.email || '-',
    row.profile?.contactPerson || '-',
    row.profile?.contactPosition || '-',
    row.profile?.contactNumber || '-',
    row.profile?.shopeeUsername || '-',
    row.referralCode ? 'code assigned' : 'awaiting code'
  ].join('\t'));
  const output = [header.join('\t'), ...lines].join('\n');

  try {
    await navigator.clipboard.writeText(output);
    window.alert(`${rows.length} row(s) copied. You can now paste this into your spreadsheet.`);
  } catch (_error) {
    window.alert('Clipboard access failed. Please allow clipboard permissions and try again.');
  }
}

function handleLogin(state, event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const message = document.getElementById('authMessage');

  const user = state.users.find((entry) => entry.email === email && entry.password === password);
  if (!user) {
    message.textContent = 'Incorrect email or password.';
    return;
  }

  state.currentUserId = user.id;
  saveState(state);
  message.textContent = 'Login successful. Redirecting...';
  setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);
}

function showRegisterSubmittedModal() {
  const modal = document.getElementById('registerSubmittedModal');
  const goLogin = document.getElementById('registerSubmittedGoLogin');
  if (!modal || !goLogin) {
    window.location.href = 'login.html';
    return;
  }
  modal.classList.remove('hidden');
  const handleGo = () => {
    modal.classList.add('hidden');
    window.location.href = 'login.html';
  };
  goLogin.onclick = handleGo;
  modal.onclick = (event) => {
    if (event.target === modal) {
      handleGo();
    }
  };
}

function closeTermsModal() {
  const modal = document.getElementById('termsModal');
  if (!modal) return;
  modal.classList.add('hidden');
}

function openTermsModal() {
  const modal = document.getElementById('termsModal');
  if (!modal) return;
  const consent = document.getElementById('termsAcceptCheckbox');
  const status = document.getElementById('termsStatus');
  if (consent) {
    consent.checked = false;
  }
  if (status) {
    status.textContent = '';
  }
  modal.classList.remove('hidden');
}

function closeEmailVerificationModal() {
  const modal = document.getElementById('emailVerificationModal');
  if (!modal) return;
  modal.classList.add('hidden');
}

function openEmailVerificationModal(email) {
  const modal = document.getElementById('emailVerificationModal');
  const target = document.getElementById('emailVerificationTarget');
  const status = document.getElementById('emailVerificationStatus');
  const input = document.getElementById('emailVerificationCodeInput');
  if (!modal || !target || !status || !input) return;

  target.textContent = `A verification code has been sent to ${email}.`;
  status.textContent = '';
  input.value = '';
  modal.classList.remove('hidden');
}

async function completeRegistrationAfterTerms(state, message) {
  if (!pendingRegistrationDraft) return;

  try {
    await pushRegistrationToServer(pendingRegistrationDraft.newOrg, pendingRegistrationDraft.newUser);
  } catch (error) {
    message.textContent = `Registration could not be saved to the shared server: ${error.message}`;
    return;
  }

  state.users.push(pendingRegistrationDraft.newUser);
  state.organizations.push(pendingRegistrationDraft.newOrg);
  state.currentUserId = null;
  saveState(state);
  pendingRegistrationDraft = null;
  closeTermsModal();
  closeEmailVerificationModal();
  message.textContent = 'Registration complete. You can now log in.';
  showRegisterSubmittedModal();
}

async function handleRegister(state, event) {
  event.preventDefault();
  const orgName = document.getElementById('registerName').value.trim();
  const acronym = document.getElementById('registerAcronym').value.trim().toUpperCase();
  const email = document.getElementById('registerEmail').value.trim();
  const contactPerson = document.getElementById('registerContactPerson').value.trim();
  const contactPosition = document.getElementById('registerContactPosition').value.trim();
  const contactNumber = document.getElementById('registerContactNumber').value.trim();
  const shopeeUsername = document.getElementById('registerShopeeUsername').value.trim();
  const shopeePayScreenshotFile = document.getElementById('registerShopeePayScreenshot')?.files?.[0];
  const university = document.getElementById('registerUniversity').value;
  const password = document.getElementById('registerPassword').value;
  const confirm = document.getElementById('registerConfirm').value;
  const message = document.getElementById('authMessage');

  const normalizedAcronym = acronym.replace(/[^A-Z0-9]/g, '');
  if (!normalizedAcronym || normalizedAcronym.length > 12 || /[^A-Z]/.test(normalizedAcronym)) {
    message.textContent = 'Acronym must be 1 to 12 letters only, with no spaces, numbers, or symbols.';
    return;
  }

  if (!university) {
    message.textContent = 'Please select your university.';
    return;
  }

  if (password !== confirm) {
    message.textContent = 'Passwords must match.';
    return;
  }

  if (!isPasswordComplex(password)) {
    message.textContent = 'Password must include at least one uppercase letter, one lowercase letter, and one number.';
    return;
  }

  const emailExists = state.users.some((user) => user.email.toLowerCase() === email.toLowerCase());
  if (emailExists) {
    message.textContent = 'This email is already registered.';
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    message.textContent = 'Please enter a valid organization email address.';
    return;
  }

  if (!shopeePayScreenshotFile) {
    message.textContent = 'Please upload the required ShopeePay screenshot for verification.';
    return;
  }

  if (shopeePayScreenshotFile.size > 1_500_000) {
    message.textContent = 'Please upload a screenshot that is 1.5 MB or smaller.';
    return;
  }

  const phoneUseCount = state.organizations.filter((org) => (org.profile?.contactNumber || '') === contactNumber).length;
  if (phoneUseCount >= 2) {
    message.textContent = 'This contact number has reached the maximum allowed usage (2).';
    return;
  }

  if (!/^09\d{9}$/.test(contactNumber)) {
    message.textContent = 'Contact number must follow the format 09171234567.';
    return;
  }

  const existingContact = state.organizations.find((org) => (org.profile?.contactPerson || '').toLowerCase() === contactPerson.toLowerCase());
  if (existingContact) {
    message.textContent = 'This contact person is already assigned to another organization.';
    return;
  }

  const shopeePayScreenshotData = await toDataUrl(shopeePayScreenshotFile);

  const newOrgId = Date.now();

  const newUser = {
    id: Date.now() + 1,
    name: orgName,
    email,
    password,
    role: 'organization',
    points: 0,
    weeklyReferrals: 0,
    rewardTier: 'Pending',
    organizationId: newOrgId
  };

  const newOrg = {
    id: newOrgId,
    createdAt: new Date().toISOString(),
    name: orgName,
    acronym: normalizedAcronym,
    email,
    university,
    qualifiedReferrals: 0,
    weeklyReferrals: 0,
    valid: true,
    compliant: true,
    verificationStatus: 'verified',
    inquiries: [],
    notifications: [],
    referralCode: '',
    trend: buildTrend(0),
    referrals: [],
    profile: {
      contactPerson,
      contactPosition,
      contactNumber,
      shopeeUsername,
      shopeePayScreenshotName: shopeePayScreenshotFile.name,
      shopeePayScreenshotData
    }
  };

  pendingRegistrationDraft = { newUser, newOrg };
  message.textContent = 'Please review and accept the Terms and Conditions to continue.';
  openTermsModal();
}

async function handlePasswordHelp(state, event) {
  event.preventDefault();
  const email = document.getElementById('helpEmail')?.value.trim();
  const contactPerson = document.getElementById('helpContactPerson')?.value.trim();
  const contactNumber = document.getElementById('helpContactNumber')?.value.trim();
  const message = document.getElementById('helpMessage')?.value.trim();
  const status = document.getElementById('helpStatus');
  if (!email || !contactPerson || !contactNumber || !status) {
    return;
  }

  state.inquiries.push({
    id: Date.now(),
    type: 'password-help',
    email,
    contactPerson,
    contactNumber,
    message,
    status: 'pending'
  });
  const persisted = await saveStateNow(state);
  if (!persisted) {
    saveState(state);
    status.textContent = 'Request saved locally, but server sync failed. Please retry to ensure admin receives it.';
    return;
  }
  status.textContent = 'Password recovery request submitted. The team will reach out to you.';
  document.getElementById('passwordHelpForm')?.reset();
}

async function handleInquiry(state, event) {
  event.preventDefault();
  const currentUser = getCurrentUser(state);
  if (!currentUser) return;
  const message = document.getElementById('inquiryMessage').value.trim();
  const status = document.getElementById('inquiryStatus');
  if (!message) return;
  const organization = state.organizations.find((org) => org.id === currentUser.organizationId);
  state.inquiries.push({
    id: Date.now(),
    orgId: organization?.id || null,
    orgName: currentUser.name,
    orgLabel: organization ? `${currentUser.name} · ${organization.university}` : currentUser.name,
    message,
    createdAt: new Date().toISOString(),
    status: 'pending',
    response: '',
    repliedAt: null
  });
  const persisted = await saveStateNow(state);
  if (!persisted) {
    saveState(state);
    status.textContent = 'Inquiry queued locally, but server sync failed. Please resend once your connection is stable.';
    return;
  }
  status.textContent = 'Inquiry sent to the admin.';
  document.getElementById('inquiryForm').reset();
  if (document.body.dataset.page === 'admin') {
    renderAdmin(state);
  }
}

function handleChangePassword(state, event) {
  event.preventDefault();
  const currentUser = getCurrentUser(state);
  const status = document.getElementById('changePasswordStatus');
  if (!currentUser || !status) return;

  const currentPassword = document.getElementById('currentPassword')?.value || '';
  const newPassword = document.getElementById('newPassword')?.value || '';
  const confirmNewPassword = document.getElementById('confirmNewPassword')?.value || '';

  if (currentPassword !== currentUser.password) {
    status.textContent = 'Current password is incorrect.';
    return;
  }

  if (newPassword !== confirmNewPassword) {
    status.textContent = 'New password and confirmation do not match.';
    return;
  }

  if (!isPasswordComplex(newPassword)) {
    status.textContent = 'New password must include at least one uppercase letter, one lowercase letter, and one number.';
    return;
  }

  currentUser.password = newPassword;
  saveState(state);
  status.textContent = 'Password updated successfully.';
  document.getElementById('changePasswordForm')?.reset();
}

function handlePurgePlaceholderOrganizations(state) {
  const placeholderOrgs = state.organizations.filter((org) => org.isPlaceholder);
  if (!placeholderOrgs.length) {
    window.alert('No placeholder organizations found.');
    return;
  }

  const proceed = window.confirm(`Delete all ${placeholderOrgs.length} placeholder organizations? This cannot be undone.`);
  if (!proceed) return;

  const placeholderIds = new Set(placeholderOrgs.map((org) => org.id));
  state.organizations = state.organizations.filter((org) => !placeholderIds.has(org.id));
  state.users = state.users.filter((user) => user.role !== 'organization' || !placeholderIds.has(user.organizationId));
  state.inquiries = state.inquiries.filter((inquiry) => !placeholderIds.has(inquiry.orgId));

  if (adminSelectedOrgId && !state.organizations.find((org) => org.id === adminSelectedOrgId)) {
    adminSelectedOrgId = state.organizations[0]?.id || null;
  }
  if (adminDashboardOrgId && !state.organizations.find((org) => org.id === adminDashboardOrgId)) {
    adminDashboardOrgId = state.organizations[0]?.id || null;
  }

  saveState(state);
  renderAdmin(state);
  window.alert(`Deleted ${placeholderOrgs.length} placeholder organization(s).`);
}

async function attachPageHandlers() {
  const state = await loadStateFromServer();
  setAuthLink(state);
  renderCampaignCountdown();

  const page = document.body.dataset.page;
  if (page === 'dashboard') {
    if (!requireAuth(state)) return;
    renderDashboard(state);
    document.getElementById('inquiryForm')?.addEventListener('submit', async (event) => handleInquiry(state, event));
    document.getElementById('changePasswordForm')?.addEventListener('submit', (event) => handleChangePassword(state, event));
  }

  if (page === 'leaderboard') {
    if (!requireAuth(state)) return;
    renderLeaderboard(state);
  }

  if (page === 'admin') {
    if (!requireAuth(state)) return;
    const currentUser = getCurrentUser(state);
    if (currentUser?.email !== ADMIN_EMAIL) {
      window.location.replace('dashboard.html');
      return;
    }
    document.body.dataset.role = 'admin';
    const modal = document.createElement('div');
    modal.id = 'orgModal';
    modal.className = 'modal-overlay hidden';
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        modal.classList.add('hidden');
      }
    });
    document.body.appendChild(modal);
    renderAdmin(state);
    refreshGoogleSheetWindow();
    if (adminSyncTimer) {
      window.clearInterval(adminSyncTimer);
    }
    adminSyncTimer = window.setInterval(async () => {
      const refreshed = await refreshSharedState(state);
      if (refreshed) {
        renderAdmin(state);
      }
    }, 5000);
    if (adminSheetWindowTimer) {
      window.clearInterval(adminSheetWindowTimer);
    }
    adminSheetWindowTimer = window.setInterval(() => {
      refreshGoogleSheetWindow();
    }, 60000);
    window.addEventListener('beforeunload', () => {
      if (adminSyncTimer) {
        window.clearInterval(adminSyncTimer);
        adminSyncTimer = null;
      }
      if (adminSheetWindowTimer) {
        window.clearInterval(adminSheetWindowTimer);
        adminSheetWindowTimer = null;
      }
    });
    document.getElementById('googleSheetRefreshBtn')?.addEventListener('click', () => {
      refreshGoogleSheetWindow();
    });
    document.getElementById('googleSheetSyncNowBtn')?.addEventListener('click', async () => {
      await handleGoogleSheetSyncNow(state);
    });
    document.getElementById('copySelectedReferrals')?.addEventListener('click', () => copyReferrals(state, true));
    document.getElementById('copyAllReferrals')?.addEventListener('click', () => copyReferrals(state, false));
    document.getElementById('weeklyOrgSelect')?.addEventListener('change', () => {
      const selectedId = Number(document.getElementById('weeklyOrgSelect')?.value || 0);
      renderWeeklyEncoder(state, selectedId);
    });
    document.getElementById('weeklyReferralForm')?.addEventListener('submit', (event) => handleWeeklyReferralEntry(state, event));
    document.getElementById('purgePlaceholderOrgs')?.addEventListener('click', () => handlePurgePlaceholderOrganizations(state));
    document.getElementById('adminPasswordResetForm')?.addEventListener('submit', (event) => handleAdminPasswordResetSubmit(state, event));
    document.getElementById('adminPasswordResetCancel')?.addEventListener('click', () => closeAdminPasswordResetModal());
    document.getElementById('adminPasswordResetModal')?.addEventListener('click', (event) => {
      if (event.target?.id === 'adminPasswordResetModal') {
        closeAdminPasswordResetModal();
      }
    });
  }

  document.getElementById('loginForm')?.addEventListener('submit', (event) => handleLogin(state, event));
  document.getElementById('passwordHelpForm')?.addEventListener('submit', async (event) => handlePasswordHelp(state, event));
  document.getElementById('registerForm')?.addEventListener('submit', async (event) => {
    await handleRegister(state, event);
  });

  document.getElementById('termsCancelBtn')?.addEventListener('click', () => {
    closeTermsModal();
  });

  document.getElementById('termsModal')?.addEventListener('click', (event) => {
    if (event.target?.id === 'termsModal') {
      closeTermsModal();
    }
  });

  document.getElementById('termsSubmitBtn')?.addEventListener('click', async () => {
    const consent = document.getElementById('termsAcceptCheckbox');
    const message = document.getElementById('authMessage');
    const termsStatus = document.getElementById('termsStatus');
    const submitButton = document.getElementById('termsSubmitBtn');
    if (!message) return;

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';
    }

    if (!pendingRegistrationDraft) {
      if (termsStatus) {
        termsStatus.textContent = 'Registration details were not found. Please submit the form again.';
      }
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Accept and Submit Registration';
      }
      return;
    }
    if (!consent?.checked) {
      if (termsStatus) {
        termsStatus.textContent = 'Please accept the Terms and Conditions before submitting your registration.';
      }
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Accept and Submit Registration';
      }
      return;
    }

    const email = pendingRegistrationDraft?.newUser?.email || '';
    if (!email) {
      if (termsStatus) {
        termsStatus.textContent = 'Registration email is missing. Please submit the form again.';
      }
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Accept and Submit Registration';
      }
      return;
    }

    if (termsStatus) {
      termsStatus.textContent = 'Sending verification code to your email...';
    }
    try {
      await requestEmailCode(email);
      closeTermsModal();
      openEmailVerificationModal(email);
      message.textContent = 'Verification code sent. Enter the code in the verification box to finish registration.';
    } catch (error) {
      if (termsStatus) {
        termsStatus.textContent = `Could not send verification code: ${error.message}`;
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Accept and Submit Registration';
      }
    }
  });

  document.getElementById('emailVerificationCancelBtn')?.addEventListener('click', () => {
    closeEmailVerificationModal();
  });

  document.getElementById('emailVerificationModal')?.addEventListener('click', (event) => {
    if (event.target?.id === 'emailVerificationModal') {
      closeEmailVerificationModal();
    }
  });

  document.getElementById('emailVerificationResendBtn')?.addEventListener('click', async () => {
    const status = document.getElementById('emailVerificationStatus');
    const email = pendingRegistrationDraft?.newUser?.email || '';
    if (!status || !email) return;
    status.textContent = 'Resending code...';
    try {
      await requestEmailCode(email);
      status.textContent = 'A new verification code was sent.';
    } catch (error) {
      status.textContent = `Could not resend code: ${error.message}`;
    }
  });

  document.getElementById('emailVerificationForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('emailVerificationStatus');
    const message = document.getElementById('authMessage');
    const email = pendingRegistrationDraft?.newUser?.email || '';
    const code = document.getElementById('emailVerificationCodeInput')?.value.trim() || '';
    if (!status || !message || !email) return;

    if (!/^\d{6}$/.test(code)) {
      status.textContent = 'Enter a valid 6-digit verification code.';
      return;
    }

    status.textContent = 'Verifying code...';
    try {
      const verification = await verifyEmailCode(email, code);
      if (!verification.verified) {
        status.textContent = verification.message || 'Verification failed. Please try again.';
        return;
      }
      status.textContent = 'Email verified. Completing registration...';
      await completeRegistrationAfterTerms(state, message);
    } catch (error) {
      status.textContent = `Verification error: ${error.message}`;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  attachPageHandlers();
});
