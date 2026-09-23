import * as Dialog from '@radix-ui/react-dialog'
import { ArrowDown, ArrowUp, Check, X } from 'lucide-react'
import type { ThemeChoice } from './theme'
import { ACCENTS, SECTION_LABEL, usePreferences, type Accent, type Density } from './preferences'

const THEMES: Array<{ id: ThemeChoice; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
]

/** The swatch is the accent's own fill, so it previews exactly what buttons will wear. */
const SWATCH: Record<Accent, string> = {
  green: '#00fd74',
  blue: '#00d1ff',
  pink: '#ff7ef2',
  orange: '#ff6838',
  purple: '#b874fc',
  mono: 'linear-gradient(135deg, #0a0a0a 50%, #fff 50%)',
}

function Switch({ checked, onChange, title, detail }: { checked: boolean; onChange: (next: boolean) => void; title: string; detail: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="wk-switch" onClick={() => onChange(!checked)}>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span className="wk-toggle" aria-hidden="true" />
    </button>
  )
}

/** Every viewing preference, laid out once for both the sheet and Settings. */
export function CustomizeControls() {
  const { prefs, update, theme, setTheme } = usePreferences()

  function move(index: number, by: -1 | 1) {
    const next = [...prefs.sections]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item)
    update({ sections: next })
  }

  return (
    <>
      <section className="wk-pref" aria-labelledby="pref-theme">
        <div className="wk-pref-head">
          <h3 id="pref-theme">Appearance</h3>
        </div>
        <div className="wk-theme-cards">
          {THEMES.map((option) => (
            <button key={option.id} type="button" className="wk-theme-card" aria-pressed={theme === option.id} onClick={() => setTheme(option.id)}>
              <span className="wk-theme-preview" data-look={option.id} aria-hidden="true">
                <i />
                <b>
                  <i />
                  <i />
                  <i />
                </b>
              </span>
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="wk-pref" aria-labelledby="pref-accent">
        <div className="wk-pref-head">
          <h3 id="pref-accent">Accent</h3>
          <p>{ACCENTS.find((a) => a.id === prefs.accent)?.label}</p>
        </div>
        <div className="wk-swatches">
          {ACCENTS.map((accent) => (
            <button
              key={accent.id}
              type="button"
              className="wk-swatch"
              aria-pressed={prefs.accent === accent.id}
              aria-label={accent.label}
              title={accent.label}
              onClick={() => update({ accent: accent.id })}
            >
              <i style={{ background: SWATCH[accent.id] }}>
                {prefs.accent === accent.id ? <Check aria-hidden="true" color={accent.id === 'mono' ? '#888' : '#000'} /> : null}
              </i>
            </button>
          ))}
        </div>
      </section>

      <section className="wk-pref" aria-labelledby="pref-density">
        <div className="wk-pref-head">
          <h3 id="pref-density">Density</h3>
          <p>{prefs.density === 'compact' ? 'More rows on screen' : 'More room to read'}</p>
        </div>
        <div className="wk-seg" role="group" aria-labelledby="pref-density">
          {(['comfortable', 'compact'] as Density[]).map((density) => (
            <button key={density} type="button" aria-pressed={prefs.density === density} onClick={() => update({ density })}>
              {density === 'comfortable' ? 'Comfortable' : 'Compact'}
            </button>
          ))}
        </div>
      </section>

      <section className="wk-pref" aria-labelledby="pref-display">
        <div className="wk-pref-head">
          <h3 id="pref-display">Display</h3>
        </div>
        <Switch
          checked={prefs.cents}
          onChange={(cents) => update({ cents })}
          title="Show cents on totals"
          detail="Tables and finding pages always show cents"
        />
        <Switch
          checked={prefs.sidebarCollapsed}
          onChange={(sidebarCollapsed) => update({ sidebarCollapsed })}
          title="Collapse the sidebar"
          detail="Icons only, for more room on smaller screens"
        />
      </section>

      <section className="wk-pref" aria-labelledby="pref-sections">
        <div className="wk-pref-head">
          <h3 id="pref-sections">Overview sections</h3>
          <p>Show, hide and reorder</p>
        </div>
        <ul className="wk-sections">
          {prefs.sections.map((section, index) => {
            const label = SECTION_LABEL[section.id]
            const inputId = `pref-section-${section.id}`
            return (
              <li key={section.id} data-hidden={!section.visible || undefined}>
                <input
                  id={inputId}
                  type="checkbox"
                  checked={section.visible}
                  onChange={(event) =>
                    update({ sections: prefs.sections.map((s) => (s.id === section.id ? { ...s, visible: event.target.checked } : s)) })
                  }
                />
                <label htmlFor={inputId} style={{ minWidth: 0, cursor: 'pointer' }}>
                  <strong>{label.title}</strong>
                  <small>{label.detail}</small>
                </label>
                <span className="wk-sections-move">
                  <button type="button" className="wk-icon-btn" aria-label={`Move ${label.title} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="wk-icon-btn"
                    aria-label={`Move ${label.title} down`}
                    disabled={index === prefs.sections.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}

export function CustomizeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { reset } = usePreferences()
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="wk wk-overlay" style={{ background: 'transparent' }} />
        <Dialog.Content className="wk wk-sheet" aria-describedby="customize-desc">
            <div className="wk-sheet-grab" aria-hidden="true" />
          <div className="wk-sheet-head">
              <div>
                <Dialog.Title asChild>
                  <h2>Customize</h2>
                </Dialog.Title>
                <p id="customize-desc">How the workspace looks for you. Saved in this browser.</p>
              </div>
              <Dialog.Close className="wk-icon-btn" aria-label="Close">
                <X aria-hidden="true" />
              </Dialog.Close>
            </div>
            <div className="wk-sheet-body">
              <CustomizeControls />
            </div>
            <div className="wk-sheet-foot">
              <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={reset}>
                Reset to defaults
              </button>
              <Dialog.Close className="wk-btn" data-variant="dark" data-size="sm">
                Done
              </Dialog.Close>
            </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
