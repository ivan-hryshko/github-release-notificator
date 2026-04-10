import { sendEmail } from '../notifier/notifier.service.js';

const ok = await sendEmail(
  'test@example.com',
  'Test from GitHub Release Notificator',
  '<h2>It works!</h2><p>Email sending is configured correctly.</p>',
);

console.log(ok ? '✅ Email sent — check http://localhost:8025 (MailHog)' : '❌ Failed to send email');
process.exit(0);
