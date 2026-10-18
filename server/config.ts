/**
 * Everything the server reads from the environment, in one place, with what
 * each value is for and whether it is a secret. Nothing here is ever sent to
 * the browser except the booleans exposed by `/api/auth/providers`.
 */
export interface ServerConfig {
  port: number
  /** Where the app is served from, used to build links in email and OAuth redirects. */
  appOrigin: string
  databasePath: string
  /** Secure cookies + real email required. Set NODE_ENV=production. */
  production: boolean
  requireEmailVerification: boolean
  sessionDays: number
  rememberMeDays: number
  /** Google OAuth (Phase 2E). Client secret is a secret; client id is public. */
  google: { clientId: string; clientSecret: string } | null
  /** Email delivery. Without a provider the server uses the dev mailbox. */
  resend: { apiKey: string; from: string } | null
  /** Or Gmail SMTP with an app password: sends from that Gmail address. Used when Resend is not set. */
  gmail: { user: string; appPassword: string } | null
  /** AI drafting (Phase 2C). The key never leaves the server. */
  anthropicApiKey: string | null
  anthropicModel: string
  /** Where the landing site's contact form is delivered. */
  contactEmail: string
  /** Exposes /api/dev/mailbox and /api/dev/plan. Never true in production; on by default only for a localhost origin. */
  devMailbox: boolean
  /**
   * QuickBooks Online, sandbox only. Client secret and token key are secrets.
   * The token key (32 random bytes, base64) seals stored access tokens; losing
   * it only means customers reconnect.
   */
  quickbooks: { clientId: string; clientSecret: string; tokenKey: Buffer } | null
  /**
   * Stripe billing (server/billing.ts). Both are secrets. The webhook secret
   * (whsec_…) comes from the dashboard endpoint or `stripe listen`; without it
   * the webhook refuses every event.
   */
  stripe: { secretKey: string; webhookSecret: string | null } | null
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production'
  const port = Number(env.PORT ?? 8787)
  const appOrigin = (env.APP_ORIGIN ?? `http://localhost:${port}`).replace(/\/$/, '')
  const google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : null
  const gmail = env.GMAIL_USER && env.GMAIL_APP_PASSWORD ? { user: env.GMAIL_USER, appPassword: env.GMAIL_APP_PASSWORD } : null
  const resend = env.RESEND_API_KEY && env.EMAIL_FROM ? { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM } : null
  if (production) {
    const problems = productionProblems(env, appOrigin)
    if (problems.length) throw new Error(`Refusing to start in production:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
  }
  return {
    port,
    appOrigin,
    databasePath: env.DATABASE_PATH ?? './data/reclaim.sqlite',
    production,
    requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION !== 'false',
    sessionDays: Number(env.SESSION_DAYS ?? 1),
    rememberMeDays: Number(env.REMEMBER_ME_DAYS ?? 30),
    google,
    resend,
    gmail,
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? null,
    anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-opus-5',
    contactEmail: env.CONTACT_EMAIL ?? 'reclaimbusiness1@gmail.com',
    // The dev mailbox serves every verification and password-reset link to
    // anyone who asks, so it only switches itself on for a machine-local
    // origin. A staging box started without NODE_ENV=production must not
    // become an account-takeover endpoint; DEV_MAILBOX=true opts in explicitly.
    devMailbox: !production && (env.DEV_MAILBOX === 'true' || (env.DEV_MAILBOX !== 'false' && isLocalOrigin(appOrigin))),
    quickbooks: quickbooksConfig(env),
    stripe: env.STRIPE_SECRET_KEY?.trim() ? { secretKey: env.STRIPE_SECRET_KEY.trim(), webhookSecret: env.STRIPE_WEBHOOK_SECRET?.trim() || null } : null,
  }
}

/**
 * Everything that makes a production start unsafe, so one failed boot lists
 * every fix rather than one per restart. Values are never echoed: some are secrets.
 */
function productionProblems(env: NodeJS.ProcessEnv, appOrigin: string): string[] {
  const problems: string[] = []
  const set = (name: string) => !!env[name]?.trim()

  // Session cookies are marked Secure, and the Google and Intuit redirect URIs
  // are built from this. SESSION_COOKIE_SECURE_OK lets a production build run
  // on this machine over plain http, and nowhere else.
  if (!set('APP_ORIGIN')) problems.push('APP_ORIGIN is not set. Set it to the public https:// address of the app.')
  else if (!isHttpsOrigin(appOrigin) && !(env.SESSION_COOKIE_SECURE_OK && isLocalOrigin(appOrigin))) {
    problems.push('APP_ORIGIN must be an https:// origin with no path (session cookies are marked Secure).')
  }

  // Without a provider the server falls back to the dev mailbox, which is off
  // in production, so verification and reset emails would go nowhere.
  const resend = set('RESEND_API_KEY') && set('EMAIL_FROM')
  const gmail = set('GMAIL_USER') && set('GMAIL_APP_PASSWORD')
  if (set('RESEND_API_KEY') !== set('EMAIL_FROM')) problems.push('Set both RESEND_API_KEY and EMAIL_FROM, or neither.')
  if (set('GMAIL_USER') !== set('GMAIL_APP_PASSWORD')) problems.push('Set both GMAIL_USER and GMAIL_APP_PASSWORD, or neither.')
  if (!resend && !gmail) problems.push('No email provider. Set RESEND_API_KEY and EMAIL_FROM (or GMAIL_USER and GMAIL_APP_PASSWORD); the dev mailbox is not available in production.')

  // The dev mailbox hands password-reset links to anyone who asks.
  if (set('DEV_MAILBOX') && env.DEV_MAILBOX !== 'false') problems.push('DEV_MAILBOX must be unset or false in production.')

  const qbo = ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_TOKEN_KEY']
  const missing = qbo.filter((name) => !set(name))
  if (missing.length && missing.length < qbo.length) problems.push(`QuickBooks is half configured: ${missing.join(', ')} missing. Set all three QBO_* values, or none.`)

  // Without the webhook secret Stripe's events are refused, so renewals,
  // failed payments and cancellations would never reach users.plan.
  if (set('STRIPE_SECRET_KEY') !== set('STRIPE_WEBHOOK_SECRET')) problems.push('Set both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, or neither.')
  if (set('STRIPE_SECRET_KEY') && !/^(sk|rk)_(test|live)_/.test(env.STRIPE_SECRET_KEY!.trim())) problems.push('STRIPE_SECRET_KEY must be a Stripe secret key (sk_test_… or sk_live_…), never the publishable key.')

  return problems
}

function isHttpsOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return url.protocol === 'https:' && url.pathname === '/' && !url.search && !url.hash && !url.username
  } catch {
    return false
  }
}

function quickbooksConfig(env: NodeJS.ProcessEnv): ServerConfig['quickbooks'] {
  if (!env.QBO_CLIENT_ID || !env.QBO_CLIENT_SECRET || !env.QBO_TOKEN_KEY) return null
  const tokenKey = Buffer.from(env.QBO_TOKEN_KEY, 'base64')
  if (tokenKey.length !== 32) throw new Error('QBO_TOKEN_KEY must be 32 random bytes, base64-encoded (openssl rand -base64 32).')
  return { clientId: env.QBO_CLIENT_ID, clientSecret: env.QBO_CLIENT_SECRET, tokenKey }
}

function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')
  } catch {
    return false
  }
}
