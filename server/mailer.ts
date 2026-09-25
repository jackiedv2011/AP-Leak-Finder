import type { DatabaseSync } from 'node:sqlite'
import nodemailer from 'nodemailer'

export interface OutgoingMail {
  to: string
  subject: string
  body: string
  /** The one link the mail exists to deliver, kept separately so the dev inbox can show it as a button. */
  link?: string
  /** Where a reply goes, when it isn't the sender (a contact-form visitor). */
  replyTo?: string
}

export interface Mailer {
  readonly kind: 'dev' | 'resend' | 'gmail'
  send(mail: OutgoingMail): Promise<void>
}

/**
 * Development mailer: nothing leaves the machine. Mail is written to the
 * `mailbox` table and served back by `/api/dev/mailbox` so verification and
 * reset flows can be exercised end to end without an email provider.
 */
export class DevMailer implements Mailer {
  readonly kind = 'dev' as const
  private readonly db: DatabaseSync
  constructor(db: DatabaseSync) {
    this.db = db
  }
  async send(mail: OutgoingMail): Promise<void> {
    this.db
      .prepare('INSERT INTO mailbox (to_email, subject, body, link, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(mail.to.toLowerCase(), mail.subject, mail.body, mail.link ?? null, Date.now())
  }
}

/** Resend (https://resend.com) over plain HTTPS. The API key comes from the environment and is never logged. */
export class ResendMailer implements Mailer {
  readonly kind = 'resend' as const
  private readonly apiKey: string
  private readonly from: string
  constructor(apiKey: string, from: string) {
    this.apiKey = apiKey
    this.from = from
  }
  async send(mail: OutgoingMail): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.body, ...(mail.replyTo ? { reply_to: mail.replyTo } : {}) }),
    })
    if (!response.ok) throw new Error(`Email delivery failed (${response.status})`)
  }
}

/**
 * Gmail over SMTP with a Google app password (Google Account → Security →
 * 2-Step Verification → App passwords). Mail goes out from that Gmail address.
 * The password comes from the environment and is never logged.
 */
export class GmailMailer implements Mailer {
  readonly kind = 'gmail' as const
  private readonly user: string
  private readonly transport: ReturnType<typeof nodemailer.createTransport>
  constructor(user: string, appPassword: string) {
    this.user = user
    this.transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass: appPassword.replace(/\s+/g, '') } })
  }
  async send(mail: OutgoingMail): Promise<void> {
    try {
      await this.transport.sendMail({ from: `Reclaim <${this.user}>`, to: mail.to, subject: mail.subject, text: mail.body, ...(mail.replyTo ? { replyTo: mail.replyTo } : {}) })
    } catch {
      // The SMTP error can echo credentials back; only say that it failed.
      throw new Error('Email delivery failed (gmail)')
    }
  }
}
