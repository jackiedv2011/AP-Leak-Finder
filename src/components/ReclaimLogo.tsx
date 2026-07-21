import { useId, useState } from 'react'

type ReclaimMarkProps = {
  size?: number
  interactive?: boolean
  className?: string
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
export function ReclaimMark({ size = 40, interactive = false, className = '' }: ReclaimMarkProps) {
  const [isActive, setIsActive] = useState(false)
  const maskId = useId().replace(/:/g, '')
  const filterId = useId().replace(/:/g, '')
  const spreadId = useId().replace(/:/g, '')
  const accentId = useId().replace(/:/g, '')

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
          <linearGradient id={maskId} x1="0" y1="6" x2="0" y2="43" gradientUnits="userSpaceOnUse">
            <stop offset="0.72" stopColor="white" />
            <stop offset="1" stopColor="white" stopOpacity="0.52" />
          </linearGradient>
          <linearGradient id={accentId} x1="25" y1="26" x2="38" y2="39" gradientUnits="userSpaceOnUse">
            <stop offset="0.52" stopColor="currentColor" />
            <stop offset="0.525" stopColor="#79D99B" />
            <stop offset="1" stopColor="#79D99B" />
          </linearGradient>
          <filter id={filterId} x="4" y="3" width="42" height="44" filterUnits="userSpaceOnUse">
            <feDropShadow dx="1.2" dy="2" stdDeviation="1.25" floodColor="#000000" floodOpacity="0.28" />
          </filter>
          <clipPath id={spreadId}>
            <circle className="reclaim-spread" cx="32" cy="36.5" r="27" />
          </clipPath>
        </defs>

        <g filter={`url(#${filterId})`} mask={`url(#${maskId})`}>
          <path
            d="M13 39V9h11.3c6.7 0 10.7 3.4 10.7 9.2 0 4.25-2.15 7.15-5.85 8.42L38 39h-7.1l-7.8-11.35H19.4V39H13Zm6.4-16.42h4.25c3.15 0 4.95-1.5 4.95-4.12 0-2.68-1.8-4.12-4.95-4.12H19.4v8.24Z"
            fill={`url(#${accentId})`}
          />
          <g clipPath={`url(#${spreadId})`}>
            <path
              d="M13 39V9h11.3c6.7 0 10.7 3.4 10.7 9.2 0 4.25-2.15 7.15-5.85 8.42L38 39h-7.1l-7.8-11.35H19.4V39H13Zm6.4-16.42h4.25c3.15 0 4.95-1.5 4.95-4.12 0-2.68-1.8-4.12-4.95-4.12H19.4v8.24Z"
              fill="#79D99B"
            />
          </g>
        </g>
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

export function ReclaimLogo({ variant = 'full', size = 40, interactive = false, className = '' }: ReclaimLogoProps) {
  if (variant === 'mark') return <ReclaimMark size={size} interactive={interactive} className={className} />

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <ReclaimMark size={size} interactive={interactive} />
      <ReclaimWordmark interactive={interactive} />
    </span>
  )
}
