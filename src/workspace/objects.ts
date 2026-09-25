import type { FindingType } from '@/types'
import type { WorkspaceMode } from './WorkspaceShell'

/**
 * The 3D objects, and the only colour in the workspace.
 *
 * That division is deliberate rather than a shortage. The marketing site is
 * monochrome chrome — grey or black canvas, black or white type, hairline
 * rules — with a fully saturated render sitting on top of it, and the product
 * only reads as the same thing if it keeps that arrangement. So nothing else
 * tints a surface, a border or a figure: the palette lives in these objects.
 *
 * Each one is a single frame lifted out of a loop the marketing site already
 * ships, cropped to what the object actually occupies and saved with its alpha
 * intact. Transparency is what makes one file enough for both themes — there is
 * no light-mode render and no plate behind it — and a still is what keeps the
 * whole library smaller than any one of the loops it came from. Nothing on
 * these screens animates.
 */
export type ObjectName = 'tower' | 'cluster' | 'fan' | 'apart' | 'hex' | 'stack' | 'ring'

/**
 * Each still's intrinsic size, so a slot reserves the right box before the file
 * arrives and the text beside it never jumps.
 */
export const SIZE: Record<ObjectName, readonly [number, number]> = {
  tower: [518, 900],
  cluster: [635, 498],
  fan: [544, 640],
  apart: [640, 547],
  hex: [531, 537],
  stack: [383, 462],
  ring: [607, 567],
}

/** One object per destination, so no two screens open the same way. */
export const SCREEN_OBJECT: Record<WorkspaceMode, ObjectName> = {
  dashboard: 'tower',
  audits: 'apart',
  findings: 'cluster',
  recoveries: 'fan',
  reports: 'hex',
  plans: 'stack',
  settings: 'ring',
}

/**
 * What each screen is for, in one line. It sits beside the object rather than
 * under the title because the pair is the screen's opening — the sentence says
 * where you are and the object makes the screen recognisable at a glance.
 *
 * The dashboard is absent on purpose: its object stands beside the figures at
 * full height instead, which is the one place a small mark would be wasted.
 */
export const SCREEN_BLURB: Partial<Record<WorkspaceMode, string>> = {
  audits: 'Every ledger this workspace has read, and what each one turned up.',
  findings:
    'Everything the checks surfaced, ordered by what is worth chasing first — value weighed against how well the records support it.',
  recoveries: "Findings you've confirmed, and how far each one has got. Nothing reaches a vendor until you approve it.",
  reports: 'What these audits produced, stated plainly enough to forward to someone who has never opened Reclaim.',
  settings: 'Your account, how this workspace looks, and what it is holding.',
}

/**
 * The eight checks answer four questions, and the four are what a controller
 * actually asks: an exact duplicate and a near-duplicate are the same story
 * told twice, and so are an overpayment and an amount outlier. Grouping them
 * gives a finding one plain-English cause — and one object — instead of a rule
 * name only the detection engine cares about.
 */
export type CauseKey = 'twice' | 'too_much' | 'wrong_time' | 'wrong_place'

export interface Cause {
  key: CauseKey
  label: string
  object: ObjectName
}

export const CAUSES: Record<CauseKey, Cause> = {
  twice: { key: 'twice', label: 'Paid twice', object: 'stack' },
  too_much: { key: 'too_much', label: 'Paid too much', object: 'tower' },
  wrong_time: { key: 'wrong_time', label: 'Paid at the wrong time', object: 'fan' },
  wrong_place: { key: 'wrong_place', label: 'Paid to the wrong place', object: 'apart' },
}

const CAUSE_OF: Record<FindingType, CauseKey> = {
  exact_duplicate: 'twice',
  near_duplicate: 'twice',
  overpayment: 'too_much',
  amount_outlier: 'too_much',
  unclaimed_discount: 'wrong_time',
  missed_discount: 'wrong_time',
  bank_account_change: 'wrong_place',
  shared_invoice_number: 'wrong_place',
}

export function causeOf(type: FindingType): Cause {
  return CAUSES[CAUSE_OF[type]]
}
