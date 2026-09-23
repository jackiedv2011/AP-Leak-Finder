import type { CSSProperties } from 'react'
import { SCREEN_BLURB, SCREEN_OBJECT, SIZE, type ObjectName } from './objects'
import type { WorkspaceMode } from './WorkspaceShell'

interface WorkObjectProps {
  name: ObjectName
  /** Rendered height in CSS pixels. The stills are stored at twice this. */
  height: number
  className?: string
}

/**
 * Decorative by definition — the object restates the screen you are already on,
 * so a screen reader announcing it would only add noise to the heading above it.
 */
export function WorkObject({ name, height, className }: WorkObjectProps) {
  const [w, h] = SIZE[name]
  return (
    <img
      className={className ? `wk-object ${className}` : 'wk-object'}
      // The rendered height goes through a custom property rather than an
      // inline `height`, so a breakpoint can still shrink the object — an
      // inline declaration would outrank every media query in the sheet.
      // The width/height attributes stay, purely to give the layout the
      // aspect ratio before the file lands.
      style={{ '--wk-obj-h': `${height}px` } as CSSProperties}
      src={`/media/stills/${name}.webp`}
      width={Math.round((w / h) * height)}
      height={height}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
    />
  )
}

/** The screen's opening: its object and the line that says what it is for. */
export function ScreenHead({ mode }: { mode: WorkspaceMode }) {
  const blurb = SCREEN_BLURB[mode]
  if (!blurb) return null
  return (
    <div className="wk-screen-head">
      <p>{blurb}</p>
      <WorkObject name={SCREEN_OBJECT[mode]} height={184} />
    </div>
  )
}
