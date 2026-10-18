import { useEffect, useState } from 'react'

/**
 * A small filled pie: one slice of `value` out of `total`. Drawn as a circle
 * whose stroke is as wide as its diameter, so the dash length is the slice and
 * it can grow in from zero on first paint.
 */
export function MiniPie({ value, total, color, label }: { value: number; total: number; color: string; label: string }) {
  const share = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(share))
    return () => cancelAnimationFrame(frame)
  }, [share])
  const percent = Math.round(share * 100)
  const circumference = 2 * Math.PI * 8
  return (
    <svg className="wk-pie" viewBox="0 0 32 32" role="img" aria-label={`${label}: ${percent}% of everything pursued`}>
      <circle cx="16" cy="16" r="16" fill="var(--surface-hi)" />
      <circle
        className="wk-pie-slice"
        cx="16" cy="16" r="8"
        fill="none"
        stroke={color}
        strokeWidth="16"
        strokeDasharray={`${shown * circumference} ${circumference}`}
        transform="rotate(-90 16 16)"
      />
      <title>{`${percent}%`}</title>
    </svg>
  )
}
