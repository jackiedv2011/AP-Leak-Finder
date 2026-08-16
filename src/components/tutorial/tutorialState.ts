const PREFIX = 'reclaim.tutorial.seen.'
export const TOUR_IDS = ['entry', 'dashboard'] as const
export type TourId = (typeof TOUR_IDS)[number]

export function hasSeenTour(tourId: TourId): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(PREFIX + tourId) === '1'
}

export function markTourSeen(tourId: TourId): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFIX + tourId, '1')
  } catch {
    // ignore
  }
}

/** Clears every tour's "seen" flag so the full walkthrough replays from Settings/Help. */
export function resetTutorial(): void {
  if (typeof window === 'undefined') return
  TOUR_IDS.forEach((id) => {
    try {
      window.localStorage.removeItem(PREFIX + id)
    } catch {
      // ignore
    }
  })
}
