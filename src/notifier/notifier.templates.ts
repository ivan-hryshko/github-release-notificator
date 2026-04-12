import { env } from '../config/env.js';
import { escapeHtml } from '../common/html.js';

const BRAND_COLOR = '#6366f1';
const BRAND_NAME = 'Release Notifier';

function layout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
        <!-- Header -->
        <tr>
          <td style="background:${BRAND_COLOR};padding:28px 32px;text-align:center">
            <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">${BRAND_NAME}</span>
          </td>
        </tr>
        <!-- Content -->
        <tr>
          <td style="padding:32px 32px 24px">${content}</td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px 28px;border-top:1px solid #e4e4e7;text-align:center">
            <p style="margin:0;font-size:12px;color:#a1a1aa">
              ${BRAND_NAME} &mdash; GitHub release notifications made simple.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td>
    <a href="${href}" style="display:inline-block;padding:12px 28px;background:${BRAND_COLOR};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px">${label}</a>
  </td></tr></table>`;
}

export function confirmationEmail(confirmToken: string) {
  const confirmUrl = `${env.BASE_URL}/api/confirm/${confirmToken}`;

  const content = `
    <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#18181b">Confirm your subscription</h2>
    <p style="margin:0 0 4px;font-size:15px;color:#3f3f46;line-height:1.6">
      Thanks for subscribing! Click the button below to confirm your email and start receiving release notifications.
    </p>
    ${button(confirmUrl, 'Confirm subscription')}
    <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.5">
      Or copy this link: <a href="${confirmUrl}" style="color:${BRAND_COLOR};word-break:break-all">${confirmUrl}</a>
    </p>
    <p style="margin:16px 0 0;font-size:13px;color:#a1a1aa">
      If you didn't subscribe, just ignore this email.
    </p>`;

  return {
    subject: 'Confirm your subscription — Release Notifier',
    html: layout(content),
  };
}

export function releaseNotificationEmail(
  repo: string,
  tagName: string,
  releaseName: string,
  releaseUrl: string,
  unsubscribeToken: string,
) {
  const unsubscribeUrl = `${env.BASE_URL}/api/unsubscribe/${unsubscribeToken}`;
  const displayName = releaseName || tagName;

  const safeRepo = escapeHtml(repo);
  const safeTag = escapeHtml(tagName);
  const safeDisplayName = escapeHtml(displayName);
  const safeReleaseUrl = escapeHtml(releaseUrl);

  const content = `
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.5px">New Release</p>
    <h2 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#18181b">${safeRepo}</h2>
    <p style="margin:0 0 20px;font-size:17px;color:#3f3f46">
      <span style="display:inline-block;padding:4px 10px;background:#f0fdf4;color:#166534;border-radius:6px;font-weight:600;font-size:14px">${safeTag}</span>
      <span style="margin-left:8px;color:#52525b">${safeDisplayName}</span>
    </p>
    ${button(safeReleaseUrl, 'View on GitHub')}
    <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa">
      <a href="${unsubscribeUrl}" style="color:#a1a1aa;text-decoration:underline">Unsubscribe</a> from ${safeRepo} notifications.
    </p>`;

  return {
    subject: `New release: ${repo} ${tagName}`,  // subject is plain text, no escaping needed
    html: layout(content),
  };
}
