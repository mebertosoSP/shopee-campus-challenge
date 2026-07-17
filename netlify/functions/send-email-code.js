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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { message: 'Method not allowed.' });
    }

    const payload = JSON.parse(event.body || '{}');
    const email = String(payload.email || '').trim().toLowerCase();

    if (!isValidEmail(email)) {
      return json(400, { message: 'Please provide a valid email address.' });
    }

    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
      return json(500, { message: 'Email service is not configured yet. Add RESEND_API_KEY and EMAIL_FROM in Netlify environment variables.' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + (10 * 60 * 1000);

    const store = getStore('acc-club');
    await store.setJSON(`verify:${email}`, {
      code,
      expiresAt
    });

    const subject = 'Your verification code';
    const text = `Your verification code is ${code}. It expires in 10 minutes.`;

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
      const failureText = await resendResponse.text();
      return json(502, { message: `Email provider error: ${failureText}` });
    }

    return json(200, { sent: true });
  } catch (error) {
    return json(500, { message: error.message || 'Unexpected server error.' });
  }
};
