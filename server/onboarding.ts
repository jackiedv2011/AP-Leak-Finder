import { z } from 'zod'

/**
 * What onboarding learns about an account. Shared by the server (which stores it)
 * and the client (which asks for it), so both read the same shape.
 *
 * Every field is optional on purpose: someone can skip any step, or all of them,
 * and still get to their ledger. `tools` records interest only — none of those
 * integrations exists yet, and nothing here connects to anything.
 */
export const GOALS = ['unpaid', 'duplicates', 'credits', 'unsure'] as const
export const ROLES = ['owner', 'finance', 'bookkeeper', 'other'] as const
export const TEAM_SIZES = ['solo', '2-10', '11-50', '51+'] as const
export const TOOLS = ['quickbooks', 'xero', 'netsuite', 'bill', 'gmail', 'outlook', 'spreadsheets', 'other'] as const
export const AUTONOMY = ['show', 'draft', 'follow_up'] as const

export const OnboardingProfileSchema = z.object({
  goals: z.array(z.enum(GOALS)).max(GOALS.length).default([]),
  businessName: z.string().trim().max(120).default(''),
  work: z.string().trim().max(160).default(''),
  role: z.enum(ROLES).nullable().default(null),
  teamSize: z.enum(TEAM_SIZES).nullable().default(null),
  tools: z.array(z.enum(TOOLS)).max(TOOLS.length).default([]),
  toolsOther: z.string().trim().max(120).default(''),
  autonomy: z.enum(AUTONOMY).nullable().default(null),
  purpose: z.string().trim().max(600).default(''),
})

export type OnboardingProfile = z.infer<typeof OnboardingProfileSchema>

export function emptyProfile(): OnboardingProfile {
  return OnboardingProfileSchema.parse({})
}

/** Reads a stored profile. Anything unreadable comes back as null, never as an error. */
export function readProfile(raw: string | null | undefined): OnboardingProfile | null {
  if (!raw) return null
  try {
    const parsed = OnboardingProfileSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
