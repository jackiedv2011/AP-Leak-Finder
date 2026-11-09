import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Upload } from 'lucide-react'
import { MarkGraphic } from '@/components/ReclaimLogo'
import type { OnboardingProfile } from '../../server/onboarding.ts'
import './onboarding.css'

/**
 * First run, after an account is made: who the business is, where its payments live,
 * how much Reclaim should do, then the first audit. Every step can be skipped, and the
 * answers save when it ends. The left side plays the home hero's stack, one clip per
 * step, each with its sheets in new colours (landing-site/blender/render_onboarding.sh).
 */
export type OnboardingNext = 'upload' | 'sample' | null

export interface OnboardingProps {
  initial: OnboardingProfile
  /** Reopened from Settings: only the questions, ending in a save rather than a first audit. */
  revisit?: boolean
  onComplete: (profile: OnboardingProfile, next: OnboardingNext) => void | Promise<void>
}

const ROLES: ReadonlyArray<{ id: NonNullable<OnboardingProfile['role']>; label: string }> = [
  { id: 'owner', label: 'I own it' },
  { id: 'finance', label: 'I run finance' },
  { id: 'bookkeeper', label: 'I keep the books' },
  { id: 'other', label: 'Something else' },
]

const SOURCES: ReadonlyArray<{ id: OnboardingProfile['tools'][number]; name: string; guide?: string }> = [
  { id: 'quickbooks', name: 'QuickBooks Online', guide: '/guides/quickbooks-online/' },
  { id: 'xero', name: 'Xero', guide: '/guides/xero/' },
  { id: 'bill', name: 'BILL', guide: '/guides/bill/' },
  { id: 'netsuite', name: 'NetSuite', guide: '/guides/netsuite/' },
  { id: 'spreadsheets', name: 'A spreadsheet' },
  { id: 'other', name: 'Something else' },
]

const AUTONOMY: ReadonlyArray<{ id: NonNullable<OnboardingProfile['autonomy']>; title: string; body: string; tag?: string }> = [
  { id: 'show', title: 'Show me what you find', body: 'Flags possible recoveries with the proof. You take it from there.' },
  { id: 'draft', title: 'Draft it for me', body: 'Prepares the request for each finding you confirm. You send it.' },
  { id: 'follow_up', title: 'Help me follow up', body: 'Prepares follow-up reminders. Your team decides when to contact the supplier.' },
]

const STEP_COUNT = 4
const film = (step: number, ext: string) => `${import.meta.env.BASE_URL}onboarding/step-${step + 1}.${ext}`

function useReducedMotion(): boolean {
  const [reduce] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  return reduce
}

/** All the clips stay mounted, so moving to the next step crossfades instead of waiting on a load. */
function StepFilm({ step }: { step: number }) {
  const reduce = useReducedMotion()
  const videos = useRef<Array<HTMLVideoElement | null>>([])

  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (!video) return
      // React does not reflect `muted` as an attribute; autoplay policies want the property set.
      video.muted = true
      try {
        if (index === step) {
          video.currentTime = 0
          const started = video.play?.()
          if (started && typeof started.catch === 'function') started.catch(() => {})
        } else {
          video.pause?.()
        }
      } catch {
        /* no media playback here (a locked-down browser): the poster stays */
      }
    })
  }, [step])

  return (
    <div className="onb-film" aria-hidden="true">
      {Array.from({ length: STEP_COUNT }, (_, index) =>
        reduce ? (
          <img key={index} src={film(index, 'webp')} alt="" data-active={index === step} draggable={false} />
        ) : (
          <video
            key={index}
            ref={(el) => {
              videos.current[index] = el
            }}
            src={film(index, 'mp4')}
            poster={film(index, 'webp')}
            data-active={index === step}
            muted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
          />
        )
      )}
    </div>
  )
}

export function Onboarding({ initial, revisit = false, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState<OnboardingProfile>(initial)
  const [saving, setSaving] = useState(false)
  const title = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)
  const total = revisit ? STEP_COUNT - 1 : STEP_COUNT

  const update = (patch: Partial<OnboardingProfile>) => setProfile((current) => ({ ...current, ...patch }))
  const source = SOURCES.find((item) => item.id === profile.tools[0])

  // Someone using a keyboard or a screen reader starts each step at its question.
  useEffect(() => {
    if (moved.current) title.current?.focus()
    moved.current = true
  }, [step])

  const finish = async (next: OnboardingNext, answers = profile) => {
    if (saving) return
    setSaving(true)
    try {
      await onComplete(answers, next)
    } finally {
      setSaving(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (step < total - 1) setStep(step + 1)
    else if (revisit) void finish(null)
  }

  return (
    <div className="onb" data-testid="onboarding">
      <aside className="onb-side">
        <a className="onb-brand" href="/">
          <MarkGraphic splash />
          <b>Reclaim</b>
        </a>
        <StepFilm step={step} />
        <p className="onb-promise">Nothing goes to a vendor unless you approve it.</p>
      </aside>

      <main className="onb-pane">
        <header className="onb-top">
          <div className="onb-progress">
            <span className="onb-bars" aria-hidden="true">
              {Array.from({ length: total }, (_, index) => (
                <i key={index} data-on={index <= step} />
              ))}
            </span>
            Step {step + 1} of {total}
          </div>
          <button type="button" className="onb-link" disabled={saving} onClick={() => void finish(null, revisit ? initial : profile)}>
            {revisit ? 'Close' : 'Skip setup'}
          </button>
        </header>

        <form className="onb-step" key={step} onSubmit={submit}>
          {step === 0 ? (
            <>
              <h1 ref={title} tabIndex={-1}>Tell us about your business.</h1>
              <p className="onb-sub">We put this on the requests you send to vendors.</p>
              <div className="onb-fields">
                <label className="onb-field">
                  <span>Business name</span>
                  <input value={profile.businessName} maxLength={120} autoComplete="organization" onChange={(event) => update({ businessName: event.target.value })} />
                </label>
                <label className="onb-field">
                  <span>What kind of work do you do?</span>
                  <input value={profile.work} maxLength={160} onChange={(event) => update({ work: event.target.value })} />
                </label>
                <fieldset className="onb-field">
                  <legend>Your role</legend>
                  <div className="onb-chips">
                    {ROLES.map((role) => (
                      <label key={role.id} className="onb-chip" data-on={profile.role === role.id}>
                        <input type="radio" name="role" checked={profile.role === role.id} onChange={() => update({ role: role.id })} />
                        {role.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h1 ref={title} tabIndex={-1}>Where do you keep your payments?</h1>
              <p className="onb-sub">Pick one and we’ll show you how to export it.</p>
              <div className="onb-sources" role="radiogroup" aria-label="Where you keep your payments">
                {SOURCES.map((item) => (
                  <label key={item.id} className="onb-option" data-on={profile.tools[0] === item.id}>
                    <input type="radio" name="source" checked={profile.tools[0] === item.id} onChange={() => update({ tools: [item.id] })} />
                    <span className="onb-dot" aria-hidden="true" />
                    {item.name}
                  </label>
                ))}
              </div>
              {source ? (
                <p className="onb-note">
                  {source.guide ? (
                    <>
                      Export your payments as a CSV.{' '}
                      <a href={source.guide} target="_blank" rel="noreferrer">
                        Open the {source.name} guide
                      </a>
                    </>
                  ) : (
                    'Save your payments as a CSV, with one row per payment.'
                  )}
                </p>
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h1 ref={title} tabIndex={-1}>How much should Reclaim do?</h1>
              <p className="onb-sub">You can change this any time in Settings.</p>
              <div className="onb-stack" role="radiogroup" aria-label="How much Reclaim should do">
                {AUTONOMY.map((item) => (
                  <label key={item.id} className="onb-option onb-option-tall" data-on={profile.autonomy === item.id}>
                    <input type="radio" name="autonomy" checked={profile.autonomy === item.id} onChange={() => update({ autonomy: item.id })} />
                    <span className="onb-dot" aria-hidden="true" />
                    <span className="onb-option-copy">
                      <b>{item.title}</b>
                      <small>{item.body}</small>
                    </span>
                    {item.tag ? <em>{item.tag}</em> : null}
                  </label>
                ))}
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h1 ref={title} tabIndex={-1}>Now let’s find your money.</h1>
              <p className="onb-sub">Start with your own payments, or see how it works on ours first.</p>
              <div className="onb-stack">
                <div className="onb-start" data-primary="">
                  <span className="onb-option-copy">
                    <b>Your payments</b>
                    <small>A CSV export from {source?.guide ? source.name : 'your accounting system or a spreadsheet'}, read and checked right here in your browser.</small>
                  </span>
                  <button type="button" className="onb-btn" disabled={saving} onClick={() => void finish('upload')}>
                    <Upload aria-hidden="true" />
                    Upload a ledger
                  </button>
                </div>
                <div className="onb-start">
                  <span className="onb-option-copy">
                    <b>Our sample</b>
                    <small>80 payments to 12 vendors from a made-up café, with mistakes planted in them.</small>
                  </span>
                  <button type="button" className="onb-btn" data-variant="outline" disabled={saving} onClick={() => void finish('sample')}>
                    Run the sample
                    <ArrowRight aria-hidden="true" />
                  </button>
                </div>
              </div>
            </>
          ) : null}

          <div className="onb-foot">
            {step < STEP_COUNT - 1 ? (
              <button type="submit" className="onb-btn" disabled={saving}>
                {revisit && step === total - 1 ? 'Save' : 'Continue'}
                <ArrowRight aria-hidden="true" />
              </button>
            ) : null}
            {step > 0 ? (
              <button type="button" className="onb-link" disabled={saving} onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : null}
          </div>
        </form>
      </main>
    </div>
  )
}
