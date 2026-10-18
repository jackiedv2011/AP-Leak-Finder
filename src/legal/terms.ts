/**
 * The version of the Terms of Service and Privacy Policy a new account agrees
 * to. Bump this whenever either document changes materially, so acceptance
 * records show which text a user actually agreed to.
 */
export const TERMS_VERSION = '2026-10-18-draft'
export const TERMS_EFFECTIVE_DATE = 'October 18, 2026'
export const LEGAL_CONTACT_EMAIL = 'reclaimbusiness1@gmail.com'

/** True when a signed-in account accepted an older version of the Terms and Privacy Policy, or none. */
export function termsAcceptanceDue(user: { isGuest: boolean; termsVersion: string | null } | null): boolean {
  return Boolean(user && !user.isGuest && user.termsVersion !== TERMS_VERSION)
}
