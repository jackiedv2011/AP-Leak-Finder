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
  /** AI drafting (Phase 2C). The key never leaves the server. */
  anthropicApiKey: string | null
  anthropicModel: string
  /** Exposes /api/dev/mailbox and /api/dev/plan. Never true in production; on by default only for a localhost origin. */
  devMailbox: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production'
  const port = Number(env.PORT ?? 8787)
  const appOrigin = (env.APP_ORIGIN ?? `http://localhost:${port}`).replace(/\/$/, '')
  const google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : null
  const resend = env.RESEND_API_KEY && env.EMAIL_FROM ? { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM } : null
  if (production && !env.SESSION_COOKIE_SECURE_OK && !appOrigin.startsWith('https://')) {
    throw new Error('In production APP_ORIGIN must be https:// (session cookies are marked Secure).')
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
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? null,
    anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-opus-5',
    // The dev mailbox serves every verification and password-reset link to
    // anyone who asks, so it only switches itself on for a machine-local
    // origin. A staging box started without NODE_ENV=production must not
    // become an account-takeover endpoint; DEV_MAILBOX=true opts in explicitly.
    devMailbox: !production && (env.DEV_MAILBOX === 'true' || (env.DEV_MAILBOX !== 'false' && isLocalOrigin(appOrigin))),
  }
}

function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')
  } catch {
    return false
  }
}
