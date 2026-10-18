const STORAGE_KEY = 'reclaim.senderProfile.v1'

/**
 * Who a recovery request is being sent from. Stored once per browser, not
 * per finding — a business only has one name and one AP contact, so asking
 * for it on every single case would mean retyping it sixteen times in a row.
 */
export interface SenderProfile {
  businessName: string
  senderName: string
  senderEmail: string
}

export const EMPTY_SENDER_PROFILE: SenderProfile = { businessName: '', senderName: '', senderEmail: '' }

export function loadSenderProfile(): SenderProfile {
  if (typeof window === 'undefined') return EMPTY_SENDER_PROFILE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_SENDER_PROFILE
    const parsed = JSON.parse(raw) as Partial<SenderProfile>
    return {
      businessName: parsed.businessName ?? '',
      senderName: parsed.senderName ?? '',
      senderEmail: parsed.senderEmail ?? '',
    }
  } catch {
    return EMPTY_SENDER_PROFILE
  }
}

export function saveSenderProfile(profile: SenderProfile): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // ignore — the profile is a convenience, not a correctness requirement
  }
}
