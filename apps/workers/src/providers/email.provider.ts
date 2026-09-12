import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../config.js';

export interface EmailSendInput {
  to: string;
  subject: string;
  body: string;
  /** Volitelný plain-text fallback (jinak se použije body). */
  text?: string;
}

export interface EmailSendResult {
  messageId: string;
}

export class EmailProvider {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(env: Env) {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth:
        env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    this.from = `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`;
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const info = await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: input.subject,
      text: input.text ?? input.body,
      // HTML zatím nepoužíváme — všechny šablony jsou plain-text
    });
    return { messageId: String(info.messageId ?? 'unknown') };
  }
}
