import { HelpCircle, LogOut, Trash2 } from 'lucide-react'
import { AuditShell } from '@/components/audit/AuditShell'
import { AccountMenu } from '@/components/app/AccountMenu'
import { useAuth } from '@/lib/auth/AuthContext'
import { clearEnvironment } from '@/ledger/store'
import { resetTutorial } from '@/components/tutorial/tutorialState'
import '@/pages/auth.css'

export function SettingsPage() {
  const { user, isGuest, logOut } = useAuth()

  function handleRestartTutorial() {
    resetTutorial()
    window.location.href = '/audit'
  }

  function handleClearLocalData() {
    if (!window.confirm('Clear the current ledger on this device? This cannot be undone.')) return
    clearEnvironment()
    window.location.href = '/audit'
  }

  function handleLogOut() {
    logOut()
    window.location.href = '/'
  }

  return (
    <AuditShell variant="full" topBarRight={<AccountMenu />}>
      <div className="audit-workspace settings-page">
        <header className="audit-overview-heading" style={{ marginBottom: '2rem' }}>
          <span>Settings</span>
          <h1 className="audit-overview-title">Manage your account.</h1>
        </header>

        <div className="settings-grid">
          <section className="settings-panel">
            <h2>Account</h2>
            {isGuest ? (
              <>
                <p>You&apos;re browsing as a guest. Create an account to save settings and audit history.</p>
                <a className="audit-btn" data-motion="pressable" data-motion-ray="true" data-variant="primary" href="/signup" style={{ marginTop: '1rem', width: 'max-content' }}>
                  Create account
                </a>
              </>
            ) : (
              <dl className="settings-fields">
                <div><dt>Name</dt><dd>{user?.name}</dd></div>
                <div><dt>Email</dt><dd>{user?.email}</dd></div>
              </dl>
            )}
          </section>

          <section className="settings-panel">
            <h2>Help</h2>
            <p>Replay the guided walkthrough of Reclaim&apos;s buttons and views.</p>
            <button type="button" className="audit-btn" data-motion="pressable" onClick={handleRestartTutorial} style={{ marginTop: '1rem' }}>
              <HelpCircle aria-hidden="true" size={16} />
              Restart tutorial
            </button>
          </section>

          <section className="settings-panel">
            <h2>Data</h2>
            <p>This prototype keeps your ledger in this browser only. Clearing it removes every imported record and decision on this device.</p>
            <button type="button" className="audit-btn" data-motion="pressable" data-variant="ghost" onClick={handleClearLocalData} style={{ marginTop: '1rem' }}>
              <Trash2 aria-hidden="true" size={16} />
              Clear current ledger
            </button>
          </section>

          <section className="settings-panel">
            <h2>Session</h2>
            <button type="button" className="audit-btn" data-motion="pressable" onClick={handleLogOut} style={{ marginTop: '0.25rem' }}>
              <LogOut aria-hidden="true" size={16} />
              {isGuest ? 'Exit guest mode' : 'Log out'}
            </button>
          </section>
        </div>
      </div>
    </AuditShell>
  )
}
