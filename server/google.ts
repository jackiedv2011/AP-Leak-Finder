/**
 * Google sign-in via the OAuth 2.0 authorization-code flow, done entirely on
 * the server: the browser is redirected to Google, Google redirects back here
 * with a one-time code, and this module exchanges it (with the client secret,
 * which the browser never sees) for the user's identity.
 *
 * Scopes are identity only — `openid email profile`. Gmail is a separate,
 * later consent with its own scope; it must never be folded into sign-in.
 */
export interface GoogleIdentity {
  sub: string
  email: string
  emailVerified: boolean
  givenName: string
  familyName: string
}

export interface GoogleClient {
  authorizationUrl(params: { redirectUri: string; state: string }): string
  exchangeCode(params: { code: string; redirectUri: string }): Promise<GoogleIdentity>
}

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo'
export const GOOGLE_SIGN_IN_SCOPES = ['openid', 'email', 'profile']

export function createGoogleClient(clientId: string, clientSecret: string, fetchImpl: typeof fetch = fetch): GoogleClient {
  return {
    authorizationUrl({ redirectUri, state }) {
      const url = new URL(AUTH_ENDPOINT)
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', GOOGLE_SIGN_IN_SCOPES.join(' '))
      url.searchParams.set('state', state)
      url.searchParams.set('prompt', 'select_account')
      return url.toString()
    },
    async exchangeCode({ code, redirectUri }) {
      const tokenResponse = await fetchImpl(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      })
      if (!tokenResponse.ok) throw new Error(`Google token exchange failed (${tokenResponse.status})`)
      const tokens = (await tokenResponse.json()) as { access_token?: string }
      if (!tokens.access_token) throw new Error('Google token exchange returned no access token')
      const infoResponse = await fetchImpl(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${tokens.access_token}` } })
      if (!infoResponse.ok) throw new Error(`Google userinfo failed (${infoResponse.status})`)
      const info = (await infoResponse.json()) as { sub?: string; email?: string; email_verified?: boolean; given_name?: string; family_name?: string; name?: string }
      if (!info.sub || !info.email) throw new Error('Google userinfo is missing sub/email')
      return {
        sub: info.sub,
        email: info.email,
        emailVerified: info.email_verified === true,
        givenName: info.given_name ?? info.name?.split(' ')[0] ?? '',
        familyName: info.family_name ?? info.name?.split(' ').slice(1).join(' ') ?? '',
      }
    },
  }
}
