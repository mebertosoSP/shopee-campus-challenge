const STORAGE_KEY = 'shopee-after-class-club';
const ADMIN_EMAIL = 'miguel.bertoso@shopee.com';
let adminSelectedOrgId = null;
let adminReferralFilter = 'all';
let adminDashboardOrgId = null;
let adminInquiryFilter = 'pending';
let adminResetPasswordOrgId = null;
const CAMPAIGN_END_ISO = '2026-12-30T23:59:59';
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
  { id: 1, name: 'Ateneo Campus Society', acronym: 'ACS', university: 'Ateneo de Manila University', qualifiedReferrals: 240, weeklyReferrals: 32, valid: true, compliant: true, inquiries: [], referralCode: 'ACS-4201', referrals: buildSampleReferrals('ACS', 10) },
  { id: 2, name: 'UP Lasallian Network', acronym: 'ULN', university: 'University of the Philippines', qualifiedReferrals: 210, weeklyReferrals: 25, valid: true, compliant: true, inquiries: [], referralCode: 'ULN-4102', referrals: buildSampleReferrals('ULN', 9) },
  { id: 3, name: 'Mapua Campus Creators', acronym: 'MCC', university: 'Mapua University', qualifiedReferrals: 180, weeklyReferrals: 18, valid: true, compliant: true, inquiries: [], referralCode: 'MCC-3803', referrals: buildSampleReferrals('MCC', 8) },
  { id: 4, name: 'UST Community Launch', acronym: 'UCL', university: 'University of Santo Tomas', qualifiedReferrals: 165, weeklyReferrals: 20, valid: true, compliant: true, inquiries: [], referralCode: 'UCL-3604', referrals: buildSampleReferrals('UCL', 8) },
  { id: 5, name: 'De La Salle Spark Lab', acronym: 'DSL', university: 'De La Salle University', qualifiedReferrals: 155, weeklyReferrals: 14, valid: true, compliant: true, inquiries: [], referralCode: 'DSL-3405', referrals: buildSampleReferrals('DSL', 7) },
  { id: 6, name: 'FEU Innovation Club', acronym: 'FIC', university: 'Far Eastern University', qualifiedReferrals: 132, weeklyReferrals: 12, valid: true, compliant: true, inquiries: [], referralCode: 'FIC-3306', referrals: buildSampleReferrals('FIC', 6) },
  { id: 7, name: 'Adamson Youth Hub', acronym: 'AYH', university: 'Adamson University', qualifiedReferrals: 118, weeklyReferrals: 10, valid: true, compliant: true, inquiries: [], referralCode: 'AYH-3207', referrals: buildSampleReferrals('AYH', 6) },
  { id: 8, name: 'Polytechnic Pulse', acronym: 'PPP', university: 'Polytechnic University of the Philippines', qualifiedReferrals: 104, weeklyReferrals: 9, valid: true, compliant: true, inquiries: [], referralCode: 'PPP-3108', referrals: buildSampleReferrals('PPP', 6) },
  { id: 9, name: 'NU Campus Collective', acronym: 'NUC', university: 'National University', qualifiedReferrals: 92, weeklyReferrals: 8, valid: true, compliant: true, inquiries: [], referralCode: 'NUC-3009', referrals: buildSampleReferrals('NUC', 5) },
  { id: 10, name: 'CEU Future Leaders', acronym: 'CFL', university: 'Centro Escolar University', qualifiedReferrals: 72, weeklyReferrals: 7, valid: true, compliant: true, inquiries: [], referralCode: 'CFL-2910', referrals: buildSampleReferrals('CFL', 5) },
  { id: 11, name: 'Lyceum Rise Club', acronym: 'LRC', university: 'Lyceum of the Philippines University', qualifiedReferrals: 42, weeklyReferrals: 6, valid: true, compliant: true, inquiries: [], referralCode: 'LRC-2711', referrals: buildSampleReferrals('LRC', 4) }
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
  return `${clean}-${suffix}`;
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

function normalizeState(parsed) {
  const organizations = (parsed.organizations || DEFAULT_ORGANIZATIONS).map((org) => {
    const isApproved = org.verificationStatus
      ? org.verificationStatus === 'approved'
      : Boolean(org.valid && org.compliant);
    return {
      ...org,
      acronym: (org.acronym || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
      isPlaceholder: typeof org.isPlaceholder === 'boolean' ? org.isPlaceholder : !org.createdAt,
      verificationStatus: org.verificationStatus || (isApproved ? 'approved' : 'pending'),
      rejectionReason: org.rejectionReason || '',
      valid: typeof org.valid === 'boolean' ? org.valid : isApproved,
      compliant: typeof org.compliant === 'boolean' ? org.compliant : isApproved,
      profile: {
        contactPerson: org.profile?.contactPerson || org.contactPerson || '',
        contactPosition: org.profile?.contactPosition || org.contactPosition || '',
        contactNumber: org.profile?.contactNumber || org.contactNumber || '',
        shopeeUsername: org.profile?.shopeeUsername || org.shopeeUsername || '',
        shopeePayScreenshotName: org.profile?.shopeePayScreenshotName || org.shopeePayScreenshotName || '',
        shopeePayScreenshotData: org.profile?.shopeePayScreenshotData || ''
      },
      referralCode: org.referralCode || generateReferralCode(org.acronym || org.name),
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
    if (!org.referralCode || usedCodes.has(org.referralCode)) {
      org.referralCode = generateReferralCode(org.acronym || org.name);
      while (usedCodes.has(org.referralCode)) {
        org.referralCode = generateReferralCode(org.acronym || org.name);
      }
    }
    usedCodes.add(org.referralCode);
  });

  return {
    ...parsed,
    organizations,
    inquiries: (parsed.inquiries || []).map((inquiry) => ({
      ...inquiry,
      orgId: inquiry.orgId || organizations.find((org) => org.name === inquiry.orgName || (inquiry.orgLabel || '').startsWith(org.name))?.id || null,
      createdAt: inquiry.createdAt || new Date().toISOString(),
      status: inquiry.status === 'resolved' ? 'resolved' : 'pending',
      response: inquiry.response || '',
      repliedAt: inquiry.repliedAt || null
    })),
    users: (parsed.users || []).map((user) => ({
      ...user,
      role: user.role || 'organization'
    }))
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initial = {
      users: [
        { id: 1, name: 'Miguel Bertoso', email: ADMIN_EMAIL, password: 'admin123', role: 'admin', organizationId: 1, points: 240, weeklyReferrals: 32, rewardTier: 'Grand Champion' }
      ],
      organizations: DEFAULT_ORGANIZATIONS,
      inquiries: [],
      currentUserId: null
    };
    saveState(normalizeState(initial));
    return normalizeState(initial);
  }

  const parsed = JSON.parse(raw);
  return normalizeState(parsed);
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    window.location.href = 'login.html';
  }
}

function getAwardData(org, rank) {
  const isQualified = org.qualifiedReferrals >= 50 && org.valid && org.compliant;

  if (rank === 1) {
    return {
      tier: 'Grand Champion',
      reward: '15,000 pesos + Shopee Campus Champion Trophy + 2 premium tech devices + Shopee merchandise kit + networking session with Shopee + 50 pesos per referral',
      payoutText: '15,000 pesos + 50 pesos per referral',
      highlight: 'Grand Champion is the #1 organization in the leaderboard regardless of referral count.',
      tierClass: 'grand'
    };
  }

  if (!isQualified) {
    return {
      tier: 'Non-Qualifier',
      reward: 'Quota not reached for per-referral payout.',
      payoutText: 'Not yet eligible',
      highlight: 'Needs at least 50 qualified referrals to qualify for 50 pesos per referral.',
      tierClass: 'ineligible'
    };
  }

  if (org.qualifiedReferrals >= 200) {
    return {
      tier: 'Diamond',
      reward: '7,500 pesos + Shopee merchandise kit + networking session with Shopee + 50 pesos per referral',
      payoutText: '7,500 pesos + 50 pesos per referral',
      highlight: '200+ qualified referrals.',
      tierClass: 'diamond'
    };
  }

  if (org.qualifiedReferrals >= 100) {
    return {
      tier: 'Gold',
      reward: '2,500 pesos + Shopee merchandise kit + 50 pesos per referral',
      payoutText: '2,500 pesos + 50 pesos per referral',
      highlight: '100+ qualified referrals.',
      tierClass: 'gold'
    };
  }

  return {
    tier: 'Base Reward',
    reward: '50 pesos per referral',
    payoutText: '50 pesos per referral',
    highlight: '50+ qualified referrals.',
    tierClass: 'base'
  };
}

function getProgressTier(referrals) {
  if (referrals >= 200) {
    return {
      tier: 'Diamond Level',
      note: '200 and higher: Quota reached to avail of the 50 pesos per referral and Diamond Tier rewards.',
      levelClass: 'level-diamond'
    };
  }
  if (referrals >= 125) {
    return {
      tier: 'Gold Level',
      note: '125 to 199: Quota reached to avail of the 50 pesos per referral and Gold Tier rewards.',
      levelClass: 'level-gold'
    };
  }
  if (referrals >= 50) {
    return {
      tier: 'Qualifier Level',
      note: '50 to 124: Quota reached to avail of the 50 pesos per referral.',
      levelClass: 'level-base'
    };
  }
  return {
    tier: 'Non-Qualifier Level',
    note: '0 to 49: Quota not reached to avail of the 50 pesos per referral.',
    levelClass: 'level-nonqual'
  };
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

function getReferralPayoutText(referrals) {
  if (referrals < 50) {
    return `Not eligible yet (minimum 50 required). Current formula: 50 x ${referrals} = ${referrals * 50} pesos`;
  }
  return `50 x ${referrals} = ${referrals * 50} pesos`;
}

function setDashboardMetricAccent(organization) {
  const nextTier = document.getElementById('nextTierValue');
  const payout = document.getElementById('estimatedPayout');
  const verification = document.getElementById('verificationStatus');
  if (!nextTier || !payout || !verification) return;

  [nextTier, payout, verification].forEach((element) => {
    element.classList.remove('metric-value-warn', 'metric-value-success', 'metric-value-info', 'metric-value-danger');
  });

  if (organization.verificationStatus === 'rejected') {
    verification.classList.add('metric-value-danger');
  } else if (organization.verificationStatus === 'approved') {
    verification.classList.add('metric-value-success');
  } else {
    verification.classList.add('metric-value-info');
  }

  if (organization.qualifiedReferrals < 50) {
    nextTier.classList.add('metric-value-warn');
    payout.classList.add('metric-value-warn');
  } else {
    nextTier.classList.add('metric-value-info');
    payout.classList.add('metric-value-success');
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
      <td>${organization.referralCode || '-'}</td>
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
    const replied = inquiry.repliedAt ? new Date(inquiry.repliedAt).toLocaleString() : '';
    const statusLabel = inquiry.status === 'resolved' ? 'Resolved' : 'Pending';
    return `
      <div class="thread-item">
        <p><strong>Your inquiry:</strong> ${inquiry.message}</p>
        <p class="thread-meta">Status: ${statusLabel} · Sent ${asked}</p>
        ${inquiry.response
          ? `<div class="thread-reply"><p><strong>Admin response:</strong> ${inquiry.response}</p><p class="thread-meta">Replied ${replied}</p></div>`
          : '<p class="thread-meta">Awaiting admin response.</p>'}
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
  const pendingScreen = document.getElementById('pendingApprovalScreen');
  const dashboardStatsRow = document.getElementById('dashboardStatsRow');
  const dashboardContentStack = document.getElementById('dashboardContentStack');
  const rank = state.organizations.slice().sort((a, b) => b.qualifiedReferrals - a.qualifiedReferrals).findIndex((org) => org.id === organization.id) + 1;
  const award = getAwardData(organization, rank);

  document.getElementById('userName').textContent = currentUser.name.split(' ')[0];
  document.getElementById('orgName').textContent = organization.name;
  if (currentUser.role === 'admin' && adminWrap && adminSelect) {
    adminWrap.style.display = 'inline-block';
    adminSelect.innerHTML = state.organizations
      .map((org) => `<option value="${org.id}">${org.name} (${org.verificationStatus || 'pending'})</option>`)
      .join('');
    adminSelect.value = String(organization.id);
    adminSelect.onchange = () => {
      adminDashboardOrgId = Number(adminSelect.value);
      renderDashboard(state);
    };
  } else if (adminWrap) {
    adminWrap.style.display = 'none';
  }

  const isPendingOrganization = currentUser.role !== 'admin' && organization.verificationStatus !== 'approved';
  if (pendingScreen && dashboardStatsRow && dashboardContentStack) {
    pendingScreen.classList.toggle('hidden', !isPendingOrganization);
    dashboardStatsRow.classList.toggle('hidden', isPendingOrganization);
    dashboardContentStack.classList.toggle('waiting-mode', isPendingOrganization);
  }

  if (isPendingOrganization) {
    renderDashboardProfileTable(state, organization);
    renderInquiryThread(state, organization.id);
    document.getElementById('overallReferrals').textContent = 'Pending';
    document.getElementById('tierValue').textContent = 'Pending approval';
    document.getElementById('weeklyReferrals').textContent = 'Pending';
    document.getElementById('nextTierValue').textContent = 'Waiting for admin approval';
    document.getElementById('estimatedPayout').textContent = 'Waiting for admin approval';
    document.getElementById('verificationStatus').textContent = 'Pending admin approval';
    document.getElementById('overallProgressLabel').textContent = 'Pending approval';
    document.getElementById('progressTierNote').textContent = 'Your organization is waiting for admin verification.';
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('progressFill').className = 'level-nonqual';
    document.getElementById('orgReferralCode').textContent = organization.referralCode;
    setDashboardMetricAccent(organization);
    return;
  }

  document.getElementById('overallReferrals').textContent = organization.qualifiedReferrals;
  document.getElementById('tierValue').textContent = award.tier;
  document.getElementById('weeklyReferrals').textContent = organization.weeklyReferrals;
  const nextTier = organization.qualifiedReferrals >= 200
    ? 'Maintain Diamond level or aim for #1 accolade'
    : organization.qualifiedReferrals >= 100
      ? 'Diamond (200+)'
      : organization.qualifiedReferrals >= 50
        ? 'Gold (100+)'
        : 'Qualifier threshold (50+)';
  document.getElementById('nextTierValue').textContent = nextTier;
  document.getElementById('estimatedPayout').textContent = getReferralPayoutText(organization.qualifiedReferrals);
  document.getElementById('verificationStatus').textContent = organization.verificationStatus === 'approved'
    ? 'Verified and eligible'
    : organization.verificationStatus === 'rejected'
      ? `Rejected: ${organization.rejectionReason || 'Please contact admin.'}`
      : 'Pending admin verification';
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

  document.getElementById('orgReferralCode').textContent = organization.referralCode;
  setDashboardMetricAccent(organization);
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
  return org.monthlyPerformance || org.trend || buildTrend(org.qualifiedReferrals);
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
  document.getElementById('adminOrgCount').textContent = state.organizations.length;
  document.getElementById('adminReferralCount').textContent = state.organizations.reduce((sum, org) => sum + org.qualifiedReferrals, 0);
  document.getElementById('adminPendingCount').textContent = state.organizations.filter((org) => org.verificationStatus !== 'approved').length;

  const overallTrend = state.organizations.reduce((acc, org) => {
    const values = org.trend || buildTrend(org.qualifiedReferrals);
    values.forEach((value, index) => {
      acc[index] = (acc[index] || 0) + value;
    });
    return acc;
  }, []);
  renderTrendChart(document.getElementById('overallTrendChart'), overallTrend, 'Overall referral trend');

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
          targetInquiry.response = response;
          targetInquiry.repliedAt = new Date().toISOString();
          saveState(state);
          renderAdmin(state);
        });
      });
    }
  }

  renderAdminReferralsPanel(state);
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
  if (adminReferralFilter === 'approved') {
    return all.filter((org) => org.verificationStatus === 'approved');
  }
  return all.filter((org) => org.verificationStatus !== 'approved');
}

function renderAdminReferralsPanel(state) {
  const toolbar = document.getElementById('adminReferralsToolbar');
  const body = document.getElementById('adminReferralBody');
  if (!toolbar || !body) return;

  const allCount = state.organizations.length;
  const pendingCount = state.organizations.filter((org) => org.verificationStatus !== 'approved').length;
  const approvedCount = state.organizations.filter((org) => org.verificationStatus === 'approved').length;
  toolbar.innerHTML = `
    <span class="pill">Application review queue</span>
    <button type="button" class="button ghost small" data-filter="pending">Pending (${pendingCount})</button>
    <button type="button" class="button ghost small" data-filter="approved">Approved (${approvedCount})</button>
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
    body.innerHTML = '<tr><td colspan="13">No organization profiles in this view.</td></tr>';
    return;
  }

  body.innerHTML = rows.map((org) => {
    const profile = org.profile || {};
    const payShot = profile.shopeePayScreenshotData
      ? `<a href="${profile.shopeePayScreenshotData}" target="_blank" rel="noreferrer">View</a>`
      : (profile.shopeePayScreenshotName || '-');
    const status = org.verificationStatus === 'approved'
      ? 'approved'
      : org.verificationStatus === 'rejected'
        ? 'rejected'
        : 'pending';
    const reasonOptions = ['<option value="">Select reason</option>', ...DECLINE_REASONS.map((reason) => `<option value="${reason}">${reason}</option>`)].join('');
    return `
    <tr>
      <td><input type="checkbox" class="ref-select" data-org-id="${org.id}" /></td>
      <td>${new Date(org.createdAt || Date.now()).toLocaleString()}</td>
      <td>${org.referralCode || '-'}</td>
      <td>${org.name}</td>
      <td>${org.email || '-'}</td>
      <td>${profile.contactPerson || '-'}</td>
      <td>${profile.contactPosition || '-'}</td>
      <td>${profile.contactNumber || '-'}</td>
      <td>${profile.shopeeUsername || '-'}</td>
      <td>${payShot}</td>
      <td>
        <select class="decline-reason-select" data-org-id="${org.id}">
          ${reasonOptions}
        </select>
      </td>
      <td><span class="referral-status-pill ${status}">${status}</span></td>
      <td>
        <div class="admin-action-stack">
          <button type="button" class="button ghost small" data-action="${status === 'approved' ? 'revert' : 'approve'}" data-org-id="${org.id}">${status === 'approved' ? 'Set pending' : 'Approve'}</button>
          <button type="button" class="button ghost small" data-action="decline" data-org-id="${org.id}">Decline</button>
          <button type="button" class="button ghost small" data-action="reset-password" data-org-id="${org.id}">Reset password</button>
          <button type="button" class="button ghost small danger" data-action="delete" data-org-id="${org.id}">Delete</button>
        </div>
      </td>
    </tr>
  `;
  }).join('');

  body.querySelectorAll('.decline-reason-select').forEach((select) => {
    const orgId = Number(select.dataset.orgId);
    const org = state.organizations.find((entry) => entry.id === orgId);
    if (!org) return;
    if (org.rejectionReason) {
      select.value = org.rejectionReason;
    }
  });

  body.querySelectorAll('button[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const orgId = Number(button.dataset.orgId);
      const organization = state.organizations.find((item) => item.id === orgId);
      if (!organization) return;
      if (button.dataset.action === 'approve') {
        organization.verificationStatus = 'approved';
        organization.valid = true;
        organization.compliant = true;
        organization.rejectionReason = '';
      } else if (button.dataset.action === 'revert') {
        organization.verificationStatus = 'pending';
        organization.valid = false;
        organization.compliant = false;
        organization.rejectionReason = '';
      } else if (button.dataset.action === 'decline') {
        const reasonSelect = body.querySelector(`.decline-reason-select[data-org-id="${orgId}"]`);
        const reason = reasonSelect?.value || '';
        if (!reason) {
          window.alert('Please select a decline reason before rejecting this registration.');
          return;
        }
        organization.verificationStatus = 'rejected';
        organization.valid = false;
        organization.compliant = false;
        organization.rejectionReason = reason;
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
    row.verificationStatus === 'approved' ? 'approved' : row.verificationStatus === 'rejected' ? 'rejected' : 'pending'
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

  const emailOwner = state.users.find((entry) => entry.email.toLowerCase() === email.toLowerCase());
  if (emailOwner?.role === 'organization') {
    const org = state.organizations.find((entry) => entry.id === emailOwner.organizationId);
    if (org?.verificationStatus === 'rejected') {
      message.textContent = `Registration declined: ${org.rejectionReason || 'Please contact admin for details.'}`;
      return;
    }
  }

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
  if (!normalizedAcronym || normalizedAcronym.length > 6 || /\s|\(|\)/.test(acronym)) {
    message.textContent = 'Acronym must be 1 to 6 letters/numbers only, with no spaces or parentheses.';
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

  if (!shopeePayScreenshotFile) {
    message.textContent = 'Please upload the required ShopeePay screenshot for verification.';
    return;
  }

  const emailUseCount = state.users.filter((user) => user.email.toLowerCase() === email.toLowerCase()).length;
  if (emailUseCount >= 2) {
    message.textContent = 'This organization email has reached the maximum allowed usage (2).';
    return;
  }

  const phoneUseCount = state.organizations.filter((org) => (org.profile?.contactNumber || '') === contactNumber).length;
  if (phoneUseCount >= 2) {
    message.textContent = 'This contact number has reached the maximum allowed usage (2).';
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
    valid: false,
    compliant: false,
    verificationStatus: 'pending',
    inquiries: [],
    referralCode: generateUniqueReferralCode(state, normalizedAcronym || orgName),
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

  state.users.push(newUser);
  state.organizations.push(newOrg);
  state.currentUserId = null;
  saveState(state);
  message.textContent = 'Registration submitted for verification.';
  showRegisterSubmittedModal();
}

function handlePasswordHelp(state, event) {
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
  saveState(state);
  status.textContent = 'Password recovery request submitted. The team will reach out to you.';
  document.getElementById('passwordHelpForm')?.reset();
}

function handleInquiry(state, event) {
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
  saveState(state);
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

function attachPageHandlers() {
  const state = loadState();
  setAuthLink(state);
  renderCampaignCountdown();

  const page = document.body.dataset.page;
  if (page === 'dashboard') {
    requireAuth(state);
    renderDashboard(state);
    document.getElementById('inquiryForm')?.addEventListener('submit', (event) => handleInquiry(state, event));
    document.getElementById('changePasswordForm')?.addEventListener('submit', (event) => handleChangePassword(state, event));
  }

  if (page === 'leaderboard') {
    requireAuth(state);
    renderLeaderboard(state);
  }

  if (page === 'admin') {
    requireAuth(state);
    const currentUser = getCurrentUser(state);
    if (currentUser?.email !== ADMIN_EMAIL) {
      window.location.href = 'dashboard.html';
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
  document.getElementById('passwordHelpForm')?.addEventListener('submit', (event) => handlePasswordHelp(state, event));
  document.getElementById('registerForm')?.addEventListener('submit', async (event) => {
    await handleRegister(state, event);
  });
}

document.addEventListener('DOMContentLoaded', attachPageHandlers);
