import { useState } from 'react'
import { ACTIVE_PROJECT_KEY, readProjectIndex } from '@/ledger/projectIndex'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export interface LandingAction {
  label: string
  href: string
  /** Secondary detail shown beside the label, e.g. the value still in recovery. */
  context: string | null
}

/**
 * The primary call to action points at whatever saved work is most relevant to
 * this browser: an active recovery, then an open review, then a fresh upload.
 * Kept identical to the previous landing page so returning visitors land back
 * where they left off.
 */
export function getLandingAction(): LandingAction {
  const projects = readProjectIndex()
  if (projects.length === 0) {
    return { label: 'Review your ledger', href: '/audit?entry=upload', context: null }
  }

  const activeId = window.localStorage.getItem(ACTIVE_PROJECT_KEY())
  const project = projects.find((item) => item.id === activeId) ?? projects[0]
  const projectParam = encodeURIComponent(project.id)

  if (project.recoveryActiveCount > 0) {
    return {
      label: 'Resume recovery',
      href: `/audit?project=${projectParam}&mode=recovery`,
      context: currency.format(project.recoveryActiveValue),
    }
  }
  if (project.openCaseCount > 0) {
    return {
      label: 'Continue review',
      href: `/audit?project=${projectParam}&mode=findings`,
      context: `${project.openCaseCount} open`,
    }
  }
  return { label: 'Start a new review', href: '/audit?entry=upload', context: null }
}

export function useLandingAction(): LandingAction {
  const [action] = useState(getLandingAction)
  return action
}
