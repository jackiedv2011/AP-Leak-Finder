import { useId, useState } from 'react'

type ReclaimMarkProps = {
  size?: number
  interactive?: boolean
  className?: string
  tone?: 'auto' | 'ink'
}

type ReclaimWordmarkProps = {
  interactive?: boolean
  className?: string
}

type ReclaimLogoProps = ReclaimMarkProps & {
  variant?: 'mark' | 'full'
}

/**
 * The icon is intentionally independent from the wordmark. That lets the
 * future navbar collapse from “Reclaim.” into only the R without changing
 * the identity or its interaction model.
 */
export function ReclaimMark({ size = 40, interactive = false, className = '', tone = 'auto' }: ReclaimMarkProps) {
  const [isActive, setIsActive] = useState(false)
  const accentId = useId().replace(/:/g, '')
  const inkColor = tone === 'ink' ? '#171717' : 'currentColor'

  return (
    <span
      className={`inline-flex ${className}`}
      onMouseEnter={interactive ? () => setIsActive(true) : undefined}
      onMouseLeave={interactive ? () => setIsActive(false) : undefined}
    >
      <svg
        aria-hidden="true"
        className="reclaim-mark"
        data-active={isActive}
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
      >
        <defs>
          <linearGradient id={accentId} x1="26.7" y1="33" x2="38" y2="39" gradientUnits="userSpaceOnUse">
            <stop stopColor="#58D783" />
            <stop offset="1" stopColor="#79D99B" />
          </linearGradient>
        </defs>
        <path
          d="M13 39V9h11.3c6.7 0 10.7 3.4 10.7 9.2 0 4.25-2.15 7.15-5.85 8.42L38 39h-7.1l-7.8-11.35H19.4V39H13Zm6.4-16.42h4.25c3.15 0 4.95-1.5 4.95-4.12 0-2.68-1.8-4.12-4.95-4.12H19.4v8.24Z"
          fill={inkColor}
        />
        <path className="reclaim-spread" d="M26.74 32.94 30.9 39H38l-4.01-5.6-7.25-.46Z" fill={`url(#${accentId})`} />
      </svg>
    </span>
  )
}

export function ReclaimWordmark({ interactive = false, className = '' }: ReclaimWordmarkProps) {
  const [isActive, setIsActive] = useState(false)

  return (
    <span
      className={`reclaim-wordmark text-[1.35rem] font-semibold leading-none tracking-[-0.055em] ${className}`}
      data-active={isActive}
      onMouseEnter={interactive ? () => setIsActive(true) : undefined}
      onMouseLeave={interactive ? () => setIsActive(false) : undefined}
    >
      Reclaim<span className="reclaim-wordmark-period">.</span>
    </span>
  )
}

export function ReclaimLogo({ variant = 'full', size = 40, interactive = false, className = '', tone = 'auto' }: ReclaimLogoProps) {
  if (variant === 'mark') return <ReclaimMark size={size} interactive={interactive} className={className} tone={tone} />

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <ReclaimMark size={size} interactive={interactive} tone={tone} />
      <ReclaimWordmark interactive={interactive} />
    </span>
  )
}
