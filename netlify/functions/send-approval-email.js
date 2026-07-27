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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { message: 'Method not allowed.' });
    }

    const auth = requireAdmin(event);
    if (!auth.ok) {
      return json(auth.statusCode || 401, { message: auth.message });
    }

    const payload = JSON.parse(event.body || '{}');
    const email = String(payload.email || '').trim().toLowerCase();
    const organizationName = String(payload.organizationName || '').trim();
    const referralCode = String(payload.referralCode || '').trim().toUpperCase();

    if (!isValidEmail(email) || !organizationName) {
      return json(400, { message: 'Valid email and organization name are required.' });
    }

    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
      return json(500, { message: 'Email service is not configured yet. Add RESEND_API_KEY and EMAIL_FROM in Netlify environment variables.' });
    }

    const subject = 'Shopee Campus Challenge application approved';
    const text = [
      `Hello ${organizationName},`,
      '',
      'Your organization registration has been approved.',
      'You may now sign in to the platform.',
      referralCode ? `Assigned referral code: ${referralCode}` : 'Assigned referral code: Please check your dashboard for the latest update.',
      '',
      'Shopee Campus Challenge Admin'
    ].join('\n');

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [email],
        subject,
        text
      })
    });

    if (!resendResponse.ok) {
      return json(502, { message: 'Email provider error. Please try again later.' });
    }

    return json(200, { sent: true });
  } catch (error) {
    return json(500, { message: error.message || 'Unexpected server error.' });
  }
};