import { useEffect, useState } from 'react'

/** Safari plays WebM but drops its alpha channel, so it gets the MP4 bakes instead (as landing-site/reels.js does). */
export const SAFARI = typeof navigator !== 'undefined' && /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent)

/** Onboarding loops live in public/onboarding/; BASE_URL keeps them working in a relative-base build. */
export function reelUrl(file: string): string {
  return `${import.meta.env.BASE_URL}onboarding/${file}`
}

const REDUCE = '(prefers-reduced-motion: reduce)'
const reduceQuery = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(REDUCE) : null)

export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => reduceQuery()?.matches ?? false)
  useEffect(() => {
    const query = reduceQuery()
    if (!query) return
    const sync = () => setReduce(query.matches)
    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [])
  return reduce
}
