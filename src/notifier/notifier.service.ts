import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../common/logger.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    logger.warn({ to, subject }, 'SMTP not configured — skipping email');
    return false;
  }

  try {
    await getTransporter().sendMail({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
    });
    logger.info({ to, subject }, 'Email sent');
    return true;
  } catch (err) {
    logger.error({ err, to, subject }, 'Failed to send email');
    return false;
  }
}
