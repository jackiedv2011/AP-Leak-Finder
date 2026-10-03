import { useEffect, useRef, useState } from 'react'
import { SAFARI, reelUrl, useReducedMotion } from './media'

/**
 * A pre-rendered 3D loop (landing-site/blender/onboarding.py), shipped the way the
 * landing ships its reels: VP9 WebM with alpha everywhere it plays, and an H.264 MP4
 * with the background baked in for Safari, which drops WebM alpha. The MP4 comes in
 * a dark and a light bake, so `theme` picks the one that matches what it sits on.
 * With reduced motion the first frame is shown as a still instead.
 */
export type ReelTheme = 'dark' | 'light'

interface ReelProps {
  name: string
  theme: ReelTheme
  className?: string
  loop?: boolean
  /** Mounted but held on its first frame until this turns true. */
  playing?: boolean
  onEnded?: () => void
}

export function Reel({ name, theme, className, loop = true, playing = true, onEnded }: ReelProps) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLVideoElement>(null)
  const src = reelUrl(SAFARI ? `${name}-${theme}.mp4` : `${name}.webm`)

  // Autoplay starts a loop on mount; play() is only needed when a held loop is released.
  const wasPlaying = useRef(playing)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    // React does not reflect `muted` as an attribute; autoplay policies want the property set.
    video.muted = true
    const release = playing && !wasPlaying.current
    wasPlaying.current = playing
    if (!release) return
    try {
      const started = video.play?.()
      if (started && typeof started.catch === 'function') started.catch(() => {})
    } catch {
      /* no media playback here (tests, a locked-down browser): the poster stays */
    }
  }, [playing, src])

  if (reduce) return <img className={className} src={reelUrl(`${name}.webp`)} alt="" aria-hidden="true" draggable={false} />
  return (
    <video
      ref={ref}
      key={src}
      className={className}
      src={src}
      poster={reelUrl(`${name}.webp`)}
      autoPlay={playing}
      muted
      loop={loop}
      playsInline
      preload="auto"
      aria-hidden="true"
      disablePictureInPicture
      onEnded={onEnded}
    />
  )
}

/**
 * A one-shot intro that hands over to a loop. The loop's first frame is the intro's
 * last, so the swap is invisible; the loop is mounted (and buffered) from the start
 * and only begins playing when the intro ends.
 */
export function ReelSequence({ intro, loop, theme, className }: { intro: string; loop: string; theme: ReelTheme; className?: string }) {
  const reduce = useReducedMotion()
  const [introDone, setIntroDone] = useState(false)
  if (reduce) return <Reel name={loop} theme={theme} className={className} />
  return (
    <div className={className} data-reel-sequence="">
      <Reel name={loop} theme={theme} playing={introDone} className="ob-reel-layer" />
      {introDone ? null : <Reel name={intro} theme={theme} loop={false} onEnded={() => setIntroDone(true)} className="ob-reel-layer" />}
    </div>
  )
}
