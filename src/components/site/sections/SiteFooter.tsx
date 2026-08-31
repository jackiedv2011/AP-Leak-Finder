import { ReclaimLogo } from '@/components/ReclaimLogo'
import type { LandingAction } from '@/components/site/useLandingAction'

const MENUS: { label: string; items: [string, string | null][] }[] = [
  {
    label: 'Product',
    items: [
      ['Review your ledger', '/audit?entry=upload'],
      ['Sample case', '/audit?entry=sample'],
      ['What it checks', '#checks'],
      ['How it works', '#how'],
    ],
  },
  {
    label: 'Trust',
    items: [
      ['Privacy', '#privacy'],
      ['Pricing', '#pricing'],
      ['Questions', '#faq'],
    ],
  },
  {
    label: 'Company',
    items: [
      ['About Reclaim', null],
      ['Contact', null],
      ['Terms', null],
    ],
  },
]

/**
 * The reference closes on a footer that carries the final call to action in a
 * narrow left column, with the link lists set to its right.
 */
export function SiteFooter({ action }: { action: LandingAction }) {
  return (
    <footer className="site-footer" aria-label="Site footer">
      <div className="site-shell site-footer-grid">
        <div className="site-footer-lead">
          <h2>Start with the ledger you already have</h2>
          <a className="site-button" href={action.href}>
            {action.label}
          </a>
        </div>

        <div className="site-footer-menus">
          {MENUS.map((menu) => (
            <div key={menu.label}>
              <h4>{menu.label}</h4>
              <ul>
                {menu.items.map(([label, href]) => (
                  <li key={label}>{href ? <a href={href}>{label}</a> : <span>{label}</span>}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="site-shell site-footer-base">
        <a className="site-footer-brand" href="/" aria-label="Reclaim home">
          <ReclaimLogo size={26} />
        </a>
        <small className="site-body-sm">Find it. Understand it. Reclaim it.</small>
        <small className="site-body-sm">
          © 2026 Reclaim · a client-side prototype. Sample figures come from a fictional demo
          ledger.
        </small>
      </div>
    </footer>
  )
}
