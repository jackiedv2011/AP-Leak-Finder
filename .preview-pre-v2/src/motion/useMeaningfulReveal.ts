import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * Returns true only the first time a meaningful data signature appears in
 * this browser tab. Routine navigation back to the same state stays still.
 */
export function useMeaningfulReveal(scope: string, signature: string): boolean {
  const reduceMotion = useReducedMotion()
  const storageKey = `reclaim.motion.${scope}`
  const [shouldReveal] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.sessionStorage.getItem(storageKey) !== signature
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      window.sessionStorage.setItem(storageKey, signature)
    } catch {
      // Motion remains cosmetic when session storage is unavailable.
    }
  }, [signature, storageKey])

  return shouldReveal && !reduceMotion
}
