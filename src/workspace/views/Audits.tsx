import { Plus, Sparkles, Upload, Search, Banknote } from 'lucide-react'
import { useEntitlements } from '@/lib/auth/AuthContext'
import { formatCurrency, plural } from '@/lib/format'
import { overviewSummary } from '@/ledger/views'
import { assessRecordReadiness } from '@/audit/dataReadiness'
import type { LedgerEnvironment } from '@/ledger/store'
import type { LedgerProjectSummary } from '@/ledger/projects'
import { Facts } from './Reports'

interface AuditsProps {
  env: LedgerEnvironment
  projects: LedgerProjectSummary[]
  activeProjectId: string | null
  /** Set when the open ledger is the demo session, which is never saved. */
  sampleSession: boolean
  onOpenProject: (id: string) => void
  onStartAudit: () => void
  onAddRecords: () => void
  onRunSample: () => void
}

function when(ts: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ts))
}

/** Every audit run in this workspace, and what the open one was built from. */
export function Audits({
  env,
  projects,
  activeProjectId,
  sampleSession,
  onOpenProject,
  onStartAudit,
  onAddRecords,
  onRunSample,
}: AuditsProps) {
  const s = overviewSummary(env)
  const entitlements = useEntitlements()
  const limit = entitlements.limits.auditsPerMonth
  const readiness = assessRecordReadiness(
    env.records,
    s.skippedCount,
    env.imports.flatMap((batch) => batch.detectedColumns ?? [])
  )

  return (
    <>
      <section className="wk-section">
        <div className="wk-card" data-testid="audits-explainer">
          <span className="wk-label">What an audit is</span>
          <p style={{ marginTop: 8, fontSize: 15, fontWeight: 500, maxWidth: 640 }}>
            One payment ledger — a CSV export from your accounting system — run through Reclaim&apos;s eight checks.
          </p>
          <p className="wk-dim" style={{ marginTop: 6, fontSize: 13.5, maxWidth: 640 }}>
            Each audit keeps its own findings, decisions and recoveries. Start a new audit for a new file (a new month, a new entity); add records to the open
            audit when you export more of the same books.
          </p>
          <div className="wk-launch-steps" style={{ marginTop: 18 }} aria-label="How an audit works">
            <div>
              <b>
                <Upload aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 6 }} />
                1. Upload
              </b>
              <span>A CSV with vendor, payment date and amount paid. More columns, more checks.</span>
            </div>
            <div>
              <b>
                <Search aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 6 }} />
                2. Review findings
              </b>
              <span>Open each one, read the rows behind it, and say whether it&apos;s real.</span>
            </div>
            <div>
              <b>
                <Banknote aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 6 }} />
                3. Recover
              </b>
              <span>Send the request from your own email, then record what came back.</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 18 }}>
            <button type="button" className="wk-btn" data-variant="primary" data-size="sm" onClick={onStartAudit}>
              <Plus aria-hidden="true" />
              Start a new audit
            </button>
            <button type="button" className="wk-btn" data-variant="ghost" data-size="sm" onClick={onRunSample}>
              <Sparkles aria-hidden="true" />
              Try the sample ledger
            </button>
            <span className="wk-dim" style={{ fontSize: 12.5, marginLeft: 'auto' }} data-testid="audit-usage">
              {limit === null
                ? 'Unlimited audits on Pro'
                : `${entitlements.usage.auditsThisMonth} of ${limit} audits used this month on Free`}
            </span>
          </div>
        </div>
      </section>

      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">Your audits</h2>
          <p>Click one to open it. The open audit is what every other page shows.</p>
        </div>

        {projects.length === 0 && !sampleSession ? (
          <div className="wk-empty">
            <span className="wk-label">No audits yet</span>
            <p>Start your first audit above. Every audit is kept here so you can come back to it.</p>
          </div>
        ) : (
          <div className="wk-table-wrap">
            <table className="wk-table">
              <thead>
                <tr>
                  <th>Audit</th>
                  <th>Records</th>
                  <th>Open findings</th>
                  <th>Last updated</th>
                  <th className="wk-right">Open flagged value</th>
                </tr>
              </thead>
              <tbody>
                {sampleSession ? (
                  <tr style={{ cursor: 'default' }}>
                    <td>
                      <div className="wk-table-vendor" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        Sample payment ledger
                        <span className="wk-pill" data-tone="strong">
                          Open
                        </span>
                      </div>
                      <div className="wk-table-sub">Demo data — not saved to your account</div>
                    </td>
                    <td className="wk-num">{s.recordCount}</td>
                    <td className="wk-num">{s.readyToVerifyCount + s.needsContextCount + s.worthNotingCount}</td>
                    <td className="wk-dim">Now</td>
                    <td className="wk-right wk-table-money">{formatCurrency(s.worthInvestigatingTotal)}</td>
                  </tr>
                ) : null}
                {projects.map((p) => {
                  const isActive = !sampleSession && p.id === activeProjectId
                  return (
                    <tr key={p.id} onClick={() => onOpenProject(p.id)} aria-current={isActive ? 'true' : undefined}>
                      <td>
                        <div className="wk-table-vendor" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button type="button" className="wk-table-action" onClick={(event) => { event.stopPropagation(); onOpenProject(p.id) }} aria-label={`Open ${p.name} audit`}>{p.name}</button>
                          {isActive ? (
                            <span className="wk-pill" data-tone="strong">
                              Open
                            </span>
                          ) : null}
                        </div>
                        <div className="wk-table-sub">{p.sourceLabel}</div>
                      </td>
                      <td className="wk-num">{p.recordCount}</td>
                      <td className="wk-num">{p.openCaseCount}</td>
                      <td className="wk-dim">{when(p.updatedAt)}</td>
                      <td className="wk-right wk-table-money">{formatCurrency(p.recoveryValue)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="wk-section">
        <div className="wk-section-head">
          <h2 className="wk-display wk-h2">What the open audit was built from</h2>
          <span className="wk-mark" data-tone={readiness.availableCheckCount === readiness.totalCheckCount ? 'strong' : 'quiet'}>
            {readiness.availableCheckCount} of {readiness.totalCheckCount} checks
          </span>
        </div>
        <Facts
          rows={[
            ['Payment records', String(s.recordCount)],
            ['Vendors', String(s.vendorCount)],
            ['Date range', s.dateRangeLabel ?? '—'],
            ['Rows skipped', String(s.skippedCount)],
          ]}
        />
        {readiness.weakerChecks.length > 0 ? (
          <ul className="wk-notes">
            {readiness.weakerChecks.map((check) => (
              <li key={check.label}>{check.label}</li>
            ))}
          </ul>
        ) : (
          <p className="wk-dim" style={{ fontSize: 13 }}>
            These records carry every column all {readiness.totalCheckCount} checks need.
          </p>
        )}
      </section>

      <section className="wk-section">
        <h2 className="wk-display wk-h2">Sources</h2>
        <div className="wk-card">
          <span className="wk-label">
            {env.imports.length} {plural(env.imports.length, 'file')} in this audit
          </span>
          <ul className="wk-list" style={{ marginTop: 6 }}>
            {env.imports.map((batch) => (
              <li key={batch.id}>
                <div>
                  <div style={{ fontWeight: 500 }}>{batch.sourceLabel}</div>
                  <div className="wk-table-sub">
                    {batch.mode === 'sample' ? 'Sample data' : 'Uploaded CSV'} · {batch.recordCount} {plural(batch.recordCount, 'record')}
                  </div>
                </div>
                <span className="wk-dim" style={{ fontSize: 12.5 }}>
                  {when(batch.importedAt)}
                </span>
              </li>
            ))}
          </ul>
          <p className="wk-dim" style={{ marginTop: 14, fontSize: 13, maxWidth: 560 }}>
            Reclaim only reads the files you give it. It has no connection to your accounting system and cannot change your books.
          </p>
          <button type="button" className="wk-btn" data-variant="outline" data-size="sm" style={{ marginTop: 16 }} onClick={onAddRecords}>
            Add records to this audit
          </button>
        </div>
      </section>
    </>
  )
}
