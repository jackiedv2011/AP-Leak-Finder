import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, Moon, Sun } from 'lucide-react'
import { Mark } from '@/workspace/WorkspaceShell'
import { usePreferences } from '@/workspace/preferences'
import { resolveTheme } from '@/workspace/theme'
import type { OnboardingProfile } from '../../server/onboarding.ts'
import { Reel, ReelSequence, type ReelTheme } from './Reel'
import { AUTONOMY_OPTIONS, GOAL_OPTIONS, PURPOSE_SUGGESTIONS, ROLE_OPTIONS, TEAM_OPTIONS, TOOL_OPTIONS } from './content'
import '@/workspace/workspace.css'
import '@/workspace/reclaim.css'
import './onboarding.css'

/**
 * First run, after an account is made. Eight short steps that learn what someone
 * wants back, a little about their business, where their money lives, how much
 * Reclaim should do on its own, and (optionally) why it matters — then hand over
 * to the ledger upload / sample choice that already exists (Launch).
 *
 * One frame for every step: brand and progress on top, the answer button at the
 * bottom, and a single 3D stage that changes distance rather than layout:
 *   hero    the stage is the screen, the words sit under it (welcome)
 *   stage   a smaller stage above the question (business, tools)
 *   cards   no stage; each choice carries its own small loop (goals, autonomy)
 *   wide    a wide stage of three places, labelled under each (how it works, data)
 *   finale  the stage fills the screen behind the words (the last question)
 */
type Zoom = 'hero' | 'stage' | 'cards' | 'wide' | 'finale'
type StepId = 'welcome' | 'goals' | 'business' | 'tools' | 'how' | 'autonomy' | 'data' | 'purpose'

const STEPS: Array<{ id: StepId; zoom: Zoom }> = [
  { id: 'welcome', zoom: 'hero' },
  { id: 'goals', zoom: 'cards' },
  { id: 'business', zoom: 'stage' },
  { id: 'tools', zoom: 'stage' },
  { id: 'how', zoom: 'wide' },
  { id: 'autonomy', zoom: 'cards' },
  { id: 'data', zoom: 'wide' },
  { id: 'purpose', zoom: 'finale' },
]

export interface OnboardingProps {
  initial: OnboardingProfile
  /** Shown in the welcome line; guests are not greeted by a name they never gave. */
  firstName?: string | null
  isGuest: boolean
  /** Reopened from Settings: the last step saves and returns rather than moving on to a ledger. */
  revisit?: boolean
  onComplete: (profile: OnboardingProfile) => void | Promise<void>
}

export function Onboarding({ initial, firstName, isGuest, revisit = false, onComplete }: OnboardingProps) {
  const { theme, setTheme } = usePreferences()
  const resolved: ReelTheme = resolveTheme(theme) === 'light' ? 'light' : 'dark'
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [profile, setProfile] = useState<OnboardingProfile>(initial)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const step = STEPS[index]
  const last = index === STEPS.length - 1

  // Each step announces itself: focus moves to its question, not to the top of the page.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    titleRef.current?.focus({ preventScroll: true })
  }, [index])

  const set = <K extends keyof OnboardingProfile>(key: K, value: OnboardingProfile[K]) => setProfile((p) => ({ ...p, [key]: value }))
  // Toggles read the latest answers, not the ones this render saw: two quick taps both count.
  const toggleGoal = (id: OnboardingProfile['goals'][number]) =>
    setProfile((p) => {
      const on = p.goals.includes(id)
      // "Not sure yet" means "look at everything", so it stands alone.
      if (id === 'unsure') return { ...p, goals: on ? [] : ['unsure'] }
      const rest = p.goals.filter((g) => g !== 'unsure' && g !== id)
      return { ...p, goals: on ? rest : [...rest, id] }
    })
  const toggleTool = (id: OnboardingProfile['tools'][number]) =>
    setProfile((p) => ({ ...p, tools: p.tools.includes(id) ? p.tools.filter((t) => t !== id) : [...p.tools, id] }))

  const finish = async (answers: OnboardingProfile) => {
    if (saving) return
    setSaving(true)
    try {
      await onComplete(answers)
    } finally {
      setSaving(false)
    }
  }

  const next = () => {
    if (last) return void finish(profile)
    setDir('fwd')
    setIndex((i) => Math.min(STEPS.length - 1, i + 1))
  }
  const back = () => {
    setDir('back')
    setIndex((i) => Math.max(0, i - 1))
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    next()
  }

  const answered = useMemo(() => {
    switch (step.id) {
      case 'goals':
        return profile.goals.length > 0
      case 'business':
        return Boolean(profile.businessName || profile.work || profile.role || profile.teamSize)
      case 'tools':
        return profile.tools.length > 0
      case 'autonomy':
        return profile.autonomy !== null
      default:
        return true
    }
  }, [step.id, profile])

  const cta =
    step.id === 'welcome' ? 'Let’s go' : last ? (revisit ? 'Save answers' : 'Continue to ledger setup') : answered ? 'Continue' : 'Skip this'

  return (
    <div className="wk ob" data-zoom={step.zoom} data-step={step.id} data-testid="onboarding">
      <header className="ob-top">
        <span className="ob-brand">
          <Mark />
          <b>Reclaim</b>
        </span>
        <Progress index={index} total={STEPS.length} />
        <div className="ob-top-actions">
          <button
            type="button"
            className="wk-icon-btn"
            onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
            aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {resolved === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
          {last ? null : (
            <button type="button" className="ob-skip" onClick={() => void finish(profile)} disabled={saving}>
              {revisit ? 'Save and close' : 'Skip setup'}
            </button>
          )}
        </div>
      </header>

      <form className="ob-main" onSubmit={submit} noValidate>
        {step.zoom === 'finale' ? <ReelSequence intro="finale_in" loop="finale" theme={resolved} className="ob-finale-stage" /> : null}

        <section key={step.id} className="ob-step" data-dir={dir} aria-labelledby="ob-title">
          {step.id === 'welcome' ? (
            <>
              <div className="ob-stage" data-size="hero">
                <Reel name="welcome" theme={resolved} className="ob-reel" />
              </div>
              <Heading titleRef={titleRef} kicker={firstName && !isGuest ? `Welcome, ${firstName}` : 'Welcome to Reclaim'}>
                Let’s find money that’s yours.
              </Heading>
              <p className="ob-lede">
                Some of what your business pays out should come back — a bill paid twice, a credit nobody used, a refund that never landed. Tell us a little
                about how you work and Reclaim will know where to look.
              </p>
              <p className="ob-meta">Eight short questions · about two minutes · skip anything</p>
            </>
          ) : null}

          {step.id === 'goals' ? (
            <>
              <Heading titleRef={titleRef}>What are you trying to get back?</Heading>
              <p className="ob-lede">Pick anything that sounds familiar. It decides what Reclaim looks at first.</p>
              <div className="ob-cards" data-count="4" role="group" aria-label="What you want back">
                {GOAL_OPTIONS.map((option) => {
                  const on = profile.goals.includes(option.id)
                  return (
                    <ChoiceCard
                      key={option.id}
                      role="checkbox"
                      checked={on}
                      reel={option.reel}
                      theme={resolved}
                      title={option.title}
                      body={option.body}
                      onToggle={() => toggleGoal(option.id)}
                    />
                  )
                })}
              </div>
              {profile.goals.includes('unpaid') ? (
                <p className="ob-note" role="note">
                  Worth knowing: today’s checks read the payments you’ve made — duplicates, overpayments, credits and changed bank details. Chasing unpaid
                  customer invoices is next on the list, and this answer helps decide how soon.
                </p>
              ) : null}
            </>
          ) : null}

          {step.id === 'business' ? (
            <>
              <div className="ob-stage" data-size="stage">
                <Reel name="business" theme={resolved} className="ob-reel" />
              </div>
              <Heading titleRef={titleRef}>First, a little about your business.</Heading>
              <p className="ob-lede">Just enough to make the search relevant.</p>
              <div className="ob-fields">
                <label className="ob-field">
                  <span>Business name</span>
                  <input
                    className="wk-input"
                    value={profile.businessName}
                    onChange={(e) => set('businessName', e.target.value)}
                    autoComplete="organization"
                    maxLength={120}
                    placeholder="Acme Paper Co."
                  />
                </label>
                <label className="ob-field">
                  <span>What kind of work do you do?</span>
                  <input
                    className="wk-input"
                    value={profile.work}
                    onChange={(e) => set('work', e.target.value)}
                    maxLength={160}
                    placeholder="Commercial cleaning, B2B paper distribution…"
                  />
                </label>
                <ChipGroup wide label="Your role" options={ROLE_OPTIONS} value={profile.role} onChange={(v) => set('role', v)} />
                <ChipGroup wide label="How many people work there?" options={TEAM_OPTIONS} value={profile.teamSize} onChange={(v) => set('teamSize', v)} />
              </div>
            </>
          ) : null}

          {step.id === 'tools' ? (
            <>
              <div className="ob-stage" data-size="stage">
                <Reel name="tools" theme={resolved} className="ob-reel ob-soft" />
              </div>
              <Heading titleRef={titleRef}>Where does the money live?</Heading>
              <p className="ob-lede">Pick the tools you already use. Nothing connects yet — this tells us what to build first, and what to ask you for.</p>
              <div className="ob-tools" role="group" aria-label="Tools you use">
                {TOOL_OPTIONS.map((tool) => {
                  const on = profile.tools.includes(tool.id)
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      className="ob-tool"
                      data-on={on || undefined}
                      onClick={() => toggleTool(tool.id)}
                    >
                      <span className="ob-tool-mono" aria-hidden="true">
                        {tool.mono}
                      </span>
                      <span className="ob-tool-name">{tool.name}</span>
                      <span className="ob-tool-status" data-ready={tool.ready || undefined}>
                        {tool.ready ? 'Works today' : tool.id === 'other' ? '' : 'Coming later'}
                      </span>
                      <span className="ob-tick" aria-hidden="true">
                        {on ? <Check /> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
              {profile.tools.includes('other') ? (
                <label className="ob-field ob-field-inline">
                  <span>Which one?</span>
                  <input className="wk-input" value={profile.toolsOther} onChange={(e) => set('toolsOther', e.target.value)} maxLength={120} autoFocus />
                </label>
              ) : null}
              <p className="ob-note">Until a direct connection exists, every one of these can export payments to a CSV, and Reclaim reads that today.</p>
            </>
          ) : null}

          {step.id === 'how' ? (
            <>
              <Heading titleRef={titleRef}>We find it. You stay in control.</Heading>
              <p className="ob-lede">Reclaim does the digging. Every call about money is yours.</p>
              <Wide reel="how" theme={resolved}>
                <Third n="01" title="Find">
                  Every payment is checked for duplicates, overpayments, missed credits and changed bank details.
                </Third>
                <Third n="02" title="You review">
                  Each finding opens to the exact records behind it. You decide what’s real.
                </Third>
                <Third n="03" title="Track recovery">
                  It counts as money back when the refund settles or the credit is used — not when it’s promised.
                </Third>
              </Wide>
            </>
          ) : null}

          {step.id === 'autonomy' ? (
            <>
              <Heading titleRef={titleRef}>How hands-on should we be?</Heading>
              <p className="ob-lede">You can change this whenever you want. Nothing ever goes to a vendor without your say-so.</p>
              <div className="ob-cards" data-count="3" role="radiogroup" aria-label="How much Reclaim does on its own">
                {AUTONOMY_OPTIONS.map((option) => (
                  <ChoiceCard
                    key={option.id}
                    role="radio"
                    checked={profile.autonomy === option.id}
                    reel={option.reel}
                    theme={resolved}
                    title={option.title}
                    body={option.body}
                    badge={option.later ? 'Coming later' : undefined}
                    onToggle={() => setProfile((p) => ({ ...p, autonomy: p.autonomy === option.id ? null : option.id }))}
                  />
                ))}
              </div>
              {profile.autonomy === 'follow_up' ? (
                <p className="ob-note" role="note">
                  Following up on its own needs your email connected, which isn’t built yet. Until it is, Reclaim drafts each request and you send it — we’ll
                  ask before switching anything on.
                </p>
              ) : null}
            </>
          ) : null}

          {step.id === 'data' ? (
            <>
              <Heading titleRef={titleRef}>Your data shouldn’t be a mystery.</Heading>
              <p className="ob-lede">Here’s where everything goes, before you upload a thing.</p>
              <Wide reel="data" theme={resolved}>
                <Third n="01" title="On this device">
                  Reading your ledger and running every check happens in your browser. The file itself is never uploaded.
                </Third>
                <Third n="02" title={isGuest ? 'In this tab' : 'With your Reclaim account'}>
                  {isGuest
                    ? 'As a guest, the audit — payment rows and findings — stays in this tab and is gone when you close it.'
                    : 'The audit — payment rows and findings — is saved to your account, so it’s there next time, on any device.'}
                </Third>
                <Third n="03" title="To an AI service, only if you ask">
                  “Draft with AI” sends one case — the vendor, the amounts, the rows behind it and your sign-off — to Anthropic to write the letter. Never
                  bank details or your review notes. Paid plans only.
                </Third>
              </Wide>
              <p className="ob-note">
                Direct connections to QuickBooks, Xero or Gmail would move data through an API — when they exist, you’ll see exactly what each one reads
                before you connect it. <a href="/security">How Reclaim handles data</a>
              </p>
            </>
          ) : null}

          {step.id === 'purpose' ? (
            <>
              <Heading titleRef={titleRef} kicker="Last one · optional">
                What would getting it back change?
              </Heading>
              <p className="ob-lede">A sentence is plenty. It keeps this about your money, not ours.</p>
              <label className="ob-field">
                <span>For us, this money would mean…</span>
                <textarea
                  className="wk-input ob-textarea"
                  value={profile.purpose}
                  onChange={(e) => set('purpose', e.target.value)}
                  maxLength={600}
                  rows={3}
                  placeholder="A little breathing room before payroll…"
                />
              </label>
              <div className="ob-suggest" role="group" aria-label="Suggestions">
                {PURPOSE_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="ob-chip"
                    data-variant="suggest"
                    onClick={() => set('purpose', profile.purpose.trim() ? `${profile.purpose.trim().replace(/[.…]+$/, '')}. ${s}.` : `${s}.`)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <footer className="ob-foot">
          {index > 0 ? (
            <button type="button" className="wk-btn" data-variant="ghost" data-size="lg" onClick={back} disabled={saving}>
              <ArrowLeft aria-hidden="true" />
              Back
            </button>
          ) : (
            <span />
          )}
          <div className="ob-foot-go">
            {last && !revisit ? <span className="ob-next-hint">Next: upload a ledger or try the sample.</span> : null}
            <button type="submit" className="wk-btn ob-cta" data-variant={answered || step.id === 'welcome' || last ? 'primary' : 'outline'} data-size="lg" disabled={saving}>
              {cta}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}

function Progress({ index, total }: { index: number; total: number }) {
  return (
    <div className="ob-progress" role="progressbar" aria-label="Onboarding progress" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1}>
      <ol aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <li key={i} data-state={i < index ? 'done' : i === index ? 'current' : 'todo'} />
        ))}
      </ol>
      <span className="ob-count">
        Step {index + 1} of {total}
      </span>
    </div>
  )
}

function Heading({ children, kicker, titleRef }: { children: ReactNode; kicker?: string; titleRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <header className="ob-head">
      {kicker ? <span className="ob-kicker">{kicker}</span> : null}
      <h1 id="ob-title" ref={titleRef} tabIndex={-1} className="ob-title">
        {children}
      </h1>
    </header>
  )
}

function ChoiceCard({
  role,
  checked,
  reel,
  theme,
  title,
  body,
  badge,
  onToggle,
}: {
  role: 'checkbox' | 'radio'
  checked: boolean
  reel: string
  theme: ReelTheme
  title: string
  body: string
  badge?: string
  onToggle: () => void
}) {
  return (
    <button type="button" role={role} aria-checked={checked} className="ob-card" data-on={checked || undefined} onClick={onToggle}>
      <span className="ob-card-art">
        <Reel name={reel} theme={theme} className="ob-card-reel" />
      </span>
      <span className="ob-card-text">
        <strong>{title}</strong>
        <small>{body}</small>
      </span>
      {badge ? <span className="ob-badge">{badge}</span> : null}
      <span className="ob-tick" aria-hidden="true">
        {checked ? <Check /> : null}
      </span>
    </button>
  )
}

function ChipGroup<T extends string>({
  wide = false,
  label,
  options,
  value,
  onChange,
}: {
  wide?: boolean
  label: string
  options: ReadonlyArray<{ id: T; label: string }>
  value: T | null
  onChange: (value: T | null) => void
}) {
  const id = `ob-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`
  return (
    <div className="ob-field" data-wide={wide || undefined}>
      <span id={id}>{label}</span>
      <div className="ob-chips" role="radiogroup" aria-labelledby={id}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            className="ob-chip"
            data-on={value === option.id || undefined}
            onClick={() => onChange(value === option.id ? null : option.id)}
            data-id={option.id}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Wide({ reel, theme, children }: { reel: string; theme: ReelTheme; children: ReactNode }) {
  return (
    <div className="ob-wide">
      <div className="ob-stage" data-size="wide">
        <Reel name={reel} theme={theme} className="ob-reel ob-soft" />
      </div>
      <ol className="ob-thirds">{children}</ol>
    </div>
  )
}

function Third({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <li className="ob-third">
      <span className="ob-third-n">{n}</span>
      <strong>{title}</strong>
      <p>{children}</p>
    </li>
  )
}
