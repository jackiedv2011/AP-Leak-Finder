import { useEffect, useRef, useState } from 'react'

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * A figure that counts up to its value when it first appears and glides
 * between values when it changes, easing out like the rest of the motion.
 * The exact amount is always in the DOM once the animation settles.
 */
export function CountUp({ value, format, duration = 900 }: { value: number; format: (value: number) => string; duration?: number }) {
  const [shown, setShown] = useState(() => (reduced() ? value : 0))
  const from = useRef(shown)

  useEffect(() => {
    if (reduced() || typeof requestAnimationFrame === 'undefined') {
      setShown(value)
      return
    }
    const start = performance.now()
    const origin = from.current
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 4)
      const next = origin + (value - origin) * eased
      from.current = next
      setShown(t === 1 ? value : next)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return <>{format(shown)}</>
}
