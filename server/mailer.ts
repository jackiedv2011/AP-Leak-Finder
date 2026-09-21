import type { DatabaseSync } from 'node:sqlite'

export interface OutgoingMail {
  to: string
  subject: string
  body: string
  /** The one link the mail exists to deliver, kept separately so the dev inbox can show it as a button. */
  link?: string
}

export interface Mailer {
  readonly kind: 'dev' | 'resend'
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
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.body }),
    })
    if (!response.ok) throw new Error(`Email delivery failed (${response.status})`)
  }
}
