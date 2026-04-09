import { env } from '../config/env.js';

export function confirmationEmail(confirmToken: string) {
  const confirmUrl = `${env.BASE_URL}/api/confirm/${confirmToken}`;

  return {
    subject: 'Confirm your subscription — GitHub Release Notificator',
    html: `
      <h2>Confirm your subscription</h2>
      <p>Click the link below to confirm your email subscription:</p>
      <p><a href="${confirmUrl}">${confirmUrl}</a></p>
      <p>If you did not subscribe, you can ignore this email.</p>
    `,
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

  return {
    subject: `New release: ${repo} ${tagName}`,
    html: `
      <h2>New release: ${repo}</h2>
      <p><strong>${releaseName || tagName}</strong></p>
      <p><a href="${releaseUrl}">View on GitHub</a></p>
      <hr>
      <p><small><a href="${unsubscribeUrl}">Unsubscribe</a></small></p>
    `,
  };
}
