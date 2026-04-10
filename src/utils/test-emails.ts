import { sendEmail } from '../notifier/notifier.service.js';
import { confirmationEmail, releaseNotificationEmail } from '../notifier/notifier.templates.js';

const confirm = confirmationEmail('550e8400-e29b-41d4-a716-446655440000');
const release = releaseNotificationEmail(
  'anthropics/claude-code',
  'v1.0.25',
  'Claude Code v1.0.25',
  'https://github.com/anthropics/claude-code/releases/tag/v1.0.25',
  '660e8400-e29b-41d4-a716-446655440000',
);

const ok1 = await sendEmail('subscriber@example.com', confirm.subject, confirm.html);
console.log(ok1 ? '✅ Confirmation email sent' : '❌ Confirmation failed');

const ok2 = await sendEmail('subscriber@example.com', release.subject, release.html);
console.log(ok2 ? '✅ Release notification email sent' : '❌ Release notification failed');

console.log('\nCheck http://localhost:8025 to see both emails');
process.exit(0);
