import type { AUTONOMY, GOALS, ROLES, TEAM_SIZES, TOOLS } from '../../server/onboarding.ts'

/** The choices onboarding offers. `reel` names a card loop in public/onboarding/. */

export const GOAL_OPTIONS: Array<{ id: (typeof GOALS)[number]; title: string; body: string; reel: string }> = [
  { id: 'unpaid', title: 'Unpaid invoices', body: 'Money you billed for and still haven’t seen.', reel: 'ic_unpaid' },
  { id: 'duplicates', title: 'Duplicate payments', body: 'The same bill paid twice, or paid too much.', reel: 'ic_duplicate' },
  { id: 'credits', title: 'Credits or refunds', body: 'Credits a vendor owes you, refunds that never landed.', reel: 'ic_credit' },
  { id: 'unsure', title: 'Not sure yet', body: 'Look at everything and tell me what turns up.', reel: 'ic_unsure' },
]

export const ROLE_OPTIONS: ReadonlyArray<{ id: (typeof ROLES)[number]; label: string }> = [
  { id: 'owner', label: 'I own it' },
  { id: 'finance', label: 'I run finance' },
  { id: 'bookkeeper', label: 'I keep the books' },
  { id: 'other', label: 'Something else' },
]

export const TEAM_OPTIONS: ReadonlyArray<{ id: (typeof TEAM_SIZES)[number]; label: string }> = [
  { id: 'solo', label: 'Just me' },
  { id: '2-10', label: '2–10' },
  { id: '11-50', label: '11–50' },
  { id: '51+', label: '51+' },
]

/**
 * None of the direct integrations exists yet; a CSV export is the one path that works
 * today, so it is the only one marked ready. Monograms rather than logos: these are
 * other companies' marks.
 */
export const TOOL_OPTIONS: Array<{ id: (typeof TOOLS)[number]; name: string; mono: string; ready: boolean }> = [
  { id: 'quickbooks', name: 'QuickBooks Online', mono: 'QB', ready: false },
  { id: 'xero', name: 'Xero', mono: 'X', ready: false },
  { id: 'netsuite', name: 'NetSuite', mono: 'NS', ready: false },
  { id: 'bill', name: 'BILL', mono: 'B', ready: false },
  { id: 'gmail', name: 'Gmail', mono: 'G', ready: false },
  { id: 'outlook', name: 'Outlook', mono: 'O', ready: false },
  { id: 'spreadsheets', name: 'Spreadsheets or CSV exports', mono: 'CSV', ready: true },
  { id: 'other', name: 'Something else', mono: '+', ready: false },
]

export const AUTONOMY_OPTIONS: Array<{ id: (typeof AUTONOMY)[number]; title: string; body: string; reel: string; later?: boolean }> = [
  { id: 'show', title: 'Show me what you find', body: 'Reclaim flags possible recoveries with the proof. You take it from there.', reel: 'ic_show' },
  { id: 'draft', title: 'Draft it for me', body: 'For each finding you confirm, Reclaim prepares the request to the vendor. You send it.', reel: 'ic_draft' },
  {
    id: 'follow_up',
    title: 'Follow up on what I approve',
    body: 'Reclaim sends and chases the requests you approve, and stops at the limits you set.',
    reel: 'ic_approve',
    later: true,
  },
]

export const PURPOSE_SUGGESTIONS = ['More breathing room', 'Time back', 'Paying down debt', 'Keep the business moving']
