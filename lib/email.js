// lib/email.js
// OTP_MODE=console -> prints OTP to terminal (dev)
// OTP_MODE=email   -> sends real email via Resend

async function sendOtp(email, code) {
  const mode = process.env.OTP_MODE || 'console';

  if (mode === 'console') {
    console.log('\n========================================');
    console.log('  OTP for ' + email);
    console.log('  CODE: ' + code);
    console.log('  (valid 10 minutes)');
    console.log('========================================\n');
    return { mode: 'console', code };
  }

  // Real email via Resend
  var Resend = require('resend').Resend;
  var resend = new Resend(process.env.RESEND_API_KEY);

  var htmlBody = ''
    + '<div style="font-family:Inter,sans-serif;max-width:480px;margin:auto;padding:32px;background:#f8fafc;border-radius:16px">'
    +   '<h1 style="margin:0 0 12px;font-size:22px;color:#0f172a">Mr &amp; Miss Voting</h1>'
    +   '<p style="color:#475569;font-size:15px">Here is your one-time code to vote:</p>'
    +   '<div style="font-size:36px;font-weight:800;letter-spacing:8px;text-align:center;padding:24px;background:white;border-radius:12px;color:#6366f1;border:2px dashed #c7d2fe;margin:20px 0">' + code + '</div>'
    +   '<p style="color:#94a3b8;font-size:13px">This code expires in 10 minutes. If you did not request it, ignore this email.</p>'
    + '</div>';

  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
    to: email,
    subject: 'Your Mr & Miss voting code',
    html: htmlBody
  });

  return { mode: 'email' };
}

module.exports = { sendOtp };
