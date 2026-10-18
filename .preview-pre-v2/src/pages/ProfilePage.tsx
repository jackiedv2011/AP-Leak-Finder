import { useMemo } from 'react'
import { AuditShell } from '@/components/audit/AuditShell'
import { AccountMenu } from '@/components/app/AccountMenu'
import { useAuth } from '@/lib/auth/AuthContext'
import { listHistory } from '@/history/store'
import { formatCurrency } from '@/lib/format'
import '@/pages/auth.css'

export function ProfilePage() {
  const { user, isGuest } = useAuth()
  const history = useMemo(() => (user && !isGuest ? listHistory(user.id) : []), [user, isGuest])
  const totalRecoverable = history.reduce((sum, entry) => sum + entry.recoverableTotal, 0)

  if (!user || isGuest) {
    return (
      <AuditShell variant="full" topBarRight={<AccountMenu />}>
        <div className="audit-workspace">
          <div className="audit-empty-state">
            <h2>No profile yet</h2>
            <p>Create an account to build a profile and keep a record of every audit you run.</p>
            <a className="audit-btn" data-motion="pressable" data-motion-ray="true" data-variant="primary" href="/signup" style={{ marginTop: '1.25rem', width: 'max-content' }}>
              Create account
            </a>
          </div>
        </div>
      </AuditShell>
    )
  }

  const initial = user.name.trim().charAt(0).toUpperCase()

  return (
    <AuditShell variant="full" topBarRight={<AccountMenu />}>
      <div className="audit-workspace">
        <header className="profile-header">
          <span className="profile-avatar" aria-hidden="true">{initial}</span>
          <div>
            <h1 className="audit-overview-title" style={{ marginBottom: '0.35rem' }}>{user.name}</h1>
            <p>{user.email}</p>
          </div>
        </header>

        <div className="settings-grid" style={{ marginTop: '2.5rem' }}>
          <section className="settings-panel">
            <h2>Account since</h2>
            <p className="profile-stat">{new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </section>
          <section className="settings-panel">
            <h2>Audits saved</h2>
            <p className="profile-stat">{history.length}</p>
          </section>
          <section className="settings-panel">
            <h2>Total recoverable found</h2>
            <p className="profile-stat">{formatCurrency(totalRecoverable)}</p>
          </section>
        </div>

        <a className="audit-btn" data-motion="pressable" data-motion-arrow="true" data-variant="ghost" href="/history" style={{ marginTop: '2rem', width: 'max-content' }}>
          View audit history
        </a>
      </div>
    </AuditShell>
  )
}
