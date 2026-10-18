import { useCallback, useEffect, useRef, useState } from 'react'
import { autoSyncQuickBooks, type QuickBooksAutoSyncState } from '@/ledger/quickbooksAutoSync'
import type { LedgerProject } from '@/ledger/projects'

/**
 * Runs the automatic QuickBooks check once when a signed-in account opens the
 * workspace (and again on "Sync now"). `enabled` is false for guests and
 * sample sessions. `onSynced` receives the linked audit when new or changed
 * payments were merged into it.
 */
export function useQuickBooksAutoSync(enabled: boolean, onSynced: (project: LedgerProject) => void) {
  const [state, setState] = useState<QuickBooksAutoSyncState>({ kind: 'off' })
  const running = useRef(false)
  const onSyncedRef = useRef(onSynced)
  onSyncedRef.current = onSynced
  const run = useCallback(async (force: boolean) => {
    if (running.current) return
    running.current = true
    if (force) setState({ kind: 'checking' })
    const result = await autoSyncQuickBooks({ force })
    running.current = false
    setState(result.state)
    if (result.project) onSyncedRef.current(result.project)
  }, [])
  useEffect(() => {
    if (enabled) void run(false)
    else setState({ kind: 'off' })
  }, [enabled, run])
  /** `recheck`: the quiet, windowed check again (after a manual QuickBooks import links an audit). */
  return { state, syncNow: () => void run(true), recheck: () => void run(false) }
}
