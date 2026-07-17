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
    const organizationName = String(payload.organizationName || '').trim();
    const reason = String(payload.reason || '').trim();

    if (!isValidEmail(email) || !organizationName || !reason) {
      return json(400, { message: 'Valid email, organization name, and denial reason are required.' });
    }

    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
      return json(500, { message: 'Email service is not configured yet. Add RESEND_API_KEY and EMAIL_FROM in Netlify environment variables.' });
    }

    const subject = 'Shopee Campus Challenge application update';
    const text = [
      `Hello ${organizationName},`,
      '',
      'Your organization registration was not approved at this time.',
      `Reason: ${reason}`,
      '',
      'You may update your submission and contact the admin team for further assistance.',
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
      const failureText = await resendResponse.text();
      return json(502, { message: `Email provider error: ${failureText}` });
    }

    return json(200, { sent: true });
  } catch (error) {
    return json(500, { message: error.message || 'Unexpected server error.' });
  }
};
