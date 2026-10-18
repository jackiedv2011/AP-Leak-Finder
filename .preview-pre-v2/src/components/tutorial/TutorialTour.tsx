import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { hasSeenTour, markTourSeen, type TourId } from '@/components/tutorial/tutorialState'
import '@/components/tutorial/tutorial.css'

export interface TutorialStep {
  id: string
  title: string
  body: string
  /** CSS selector for the element to spotlight, or omit for a centered intro/outro card. */
  target?: string
  placement?: 'top' | 'bottom'
}

interface TutorialTourProps {
  tourId: TourId
  steps: TutorialStep[]
  /** Auto-opens on mount the first time this tour hasn't been seen. */
  autoStart?: boolean
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const PAD = 8

export function TutorialTour({ tourId, steps, autoStart = true }: TutorialTourProps) {
  const [open, setOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const skipCountRef = useRef(0)

  useEffect(() => {
    if (!autoStart || hasSeenTour(tourId)) return
    const timeout = window.setTimeout(() => setOpen(true), 500)
    return () => window.clearTimeout(timeout)
    // Only ever auto-start once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const step = steps[stepIndex]

  useEffect(() => {
    if (!open || !step) return

    function measure() {
      if (!step.target) {
        setRect(null)
        return
      }
      const el = document.querySelector(step.target as string)
      if (!el) {
        // The element this step points at isn't on screen right now — skip
        // forward rather than spotlighting nothing, but only a bounded
        // number of times so a fully broken step list can't loop forever.
        if (skipCountRef.current < steps.length) {
          skipCountRef.current += 1
          setStepIndex((i) => Math.min(i + 1, steps.length - 1))
        }
        return
      }
      const bounds = el.getBoundingClientRect()
      setRect({ top: bounds.top - PAD, left: bounds.left - PAD, width: bounds.width + PAD * 2, height: bounds.height + PAD * 2 })
    }

    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, step, steps.length])

  useEffect(() => {
    if (open) cardRef.current?.focus()
  }, [open, stepIndex])

  useEffect(() => {
    if (!open) return
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') finish()
      if (event.key === 'ArrowRight' || event.key === 'Enter') goNext()
      if (event.key === 'ArrowLeft') goBack()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stepIndex])

  function finish() {
    setOpen(false)
    markTourSeen(tourId)
  }

  function goNext() {
    if (stepIndex >= steps.length - 1) {
      finish()
      return
    }
    setStepIndex((i) => i + 1)
  }

  function goBack() {
    setStepIndex((i) => Math.max(0, i - 1))
  }

  if (!open || !step) return null

  const placement = step.placement ?? 'bottom'
  const cardStyle: CSSProperties = rect
    ? {
        position: 'fixed',
        left: `${Math.min(Math.max(rect.left, 16), window.innerWidth - 336)}px`,
        top: placement === 'top'
          ? `${Math.max(rect.top - 12, 16)}px`
          : `${Math.min(rect.top + rect.height + 12, window.innerHeight - 220)}px`,
        transform: placement === 'top' ? 'translateY(-100%)' : 'none',
      }
    : { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }

  return (
    <div className="tutorial-root" role="dialog" aria-modal="true" aria-label="Product tour">
      <div className="tutorial-scrim" />
      {rect && (
        <div
          className="tutorial-spotlight"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}

      <div className="tutorial-card" style={cardStyle} ref={cardRef} tabIndex={-1}>
        <div className="tutorial-card-head">
          <span className="tutorial-step-count">{stepIndex + 1} of {steps.length}</span>
          <button type="button" className="tutorial-skip" onClick={finish}>Skip tutorial</button>
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tutorial-progress" aria-hidden="true">
          {steps.map((s, i) => (
            <i key={s.id} data-active={i === stepIndex} data-done={i < stepIndex} />
          ))}
        </div>
        <div className="tutorial-actions">
          <button type="button" className="tutorial-btn tutorial-btn-ghost" onClick={goBack} disabled={stepIndex === 0}>
            Back
          </button>
          <button type="button" className="tutorial-btn tutorial-btn-primary" onClick={goNext}>
            {stepIndex === steps.length - 1 ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
