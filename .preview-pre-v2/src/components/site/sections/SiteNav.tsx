import { useEffect, useState } from 'react'
import { ReclaimMark, ReclaimWordmark } from '@/components/ReclaimLogo'
import type { LandingAction } from '@/components/site/useLandingAction'

const NAV_ITEMS = [
  { href: '#checks', label: 'What it checks' },
  { href: '#how', label: 'How it works' },
  { href: '#privacy', label: 'Privacy' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
] as const

/** Floating pill header. Section links track the section currently in view. */
export function SiteNav({ action }: { action: LandingAction }) {
  const [activeTarget, setActiveTarget] = useState('')

  useEffect(() => {
    const targets = NAV_ITEMS.map((item) => document.querySelector<HTMLElement>(item.href)).filter(
      (target): target is HTMLElement => target !== null
    )
    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActiveTarget(`#${visible.target.id}`)
      },
      { rootMargin: '-20% 0px -68% 0px', threshold: [0.05, 0.25] }
    )

    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [])

  return (
    <header className="site-nav-shell">
      <nav className="site-nav" aria-label="Main navigation">
        <a className="site-nav-brand" href="/" aria-label="Reclaim home">
          <ReclaimMark size={26} tone="ink" interactive />
          <ReclaimWordmark />
        </a>
        <div className="site-nav-links">
          {NAV_ITEMS.map((item) => (
            <a
              href={item.href}
              key={item.href}
              data-active={activeTarget === item.href}
              aria-current={activeTarget === item.href ? 'location' : undefined}
            >
              {item.label}
            </a>
          ))}
        </div>
        <div className="site-nav-end">
          {action.context && <span className="site-nav-context">{action.context}</span>}
          <a className="site-button" data-size="sm" href={action.href}>
            {action.label}
          </a>
        </div>
      </nav>
    </header>
  )
}
