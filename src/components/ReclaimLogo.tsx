import { useState } from 'react'
import { MARK_PATHS, MARK_VIEWBOX } from '@/components/reclaimMarkPaths'
import './reclaimMark.css'

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

type StackMarkProps = {
  className?: string
  /** Pad the box to a square, so the mark sits where the old square R did. */
  square?: boolean
  width?: number
  height?: number
}

/**
 * The bare mark: ink slabs in currentColor, the green slab always green, the R cut
 * through to whatever is behind it. Its slabs spread apart while an ancestor with
 * the `rk-lift` class is hovered (reclaimMark.css).
 */
export function StackMark({ className = '', square = false, width, height }: StackMarkProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={`rk-mark ${className}`}
      viewBox={square ? '-22.5 -25.5 145 145' : MARK_VIEWBOX}
      width={width}
      height={height}
    >
      <g className="rk-mark-top">
        <path fillRule="evenodd" d={MARK_PATHS.top} />
        <path d={MARK_PATHS.counter} />
      </g>
      <path className="rk-mark-upper" d={MARK_PATHS.upper} />
      <path className="rk-mark-accent" d={MARK_PATHS.accent} />
      <path className="rk-mark-lower" d={MARK_PATHS.lower} />
    </svg>
  )
}

/**
 * The icon is intentionally independent from the wordmark. That lets the
 * navbar collapse from “Reclaim.” into only the mark without changing
 * the identity or its interaction model.
 */
export function ReclaimMark({ size = 40, interactive = false, className = '', tone = 'auto' }: ReclaimMarkProps) {
  return (
    <span className={`inline-flex ${interactive ? 'rk-lift' : ''} ${className}`} style={tone === 'ink' ? { color: '#09130f' } : undefined}>
      <StackMark square className="reclaim-mark" width={size} height={size} />
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
    <span className={`inline-flex items-center gap-2.5 ${interactive ? 'rk-lift' : ''} ${className}`}>
      <ReclaimMark size={size} tone={tone} />
      <ReclaimWordmark interactive={interactive} />
    </span>
  )
}
