import type { LedgerEnvironment } from '@/ledger/store'
import { serializeEnvironment, deserializeEnvironment } from '@/ledger/store'
import { overviewSummary } from '@/ledger/views'

export type AuditStatus = 'new' | 'in_review' | 'complete'

export interface AuditHistoryEntry {
  id: string
  userId: string
  name: string
  createdAt: number
  updatedAt: number
  status: AuditStatus
  recordCount: number
  findingsCount: number
  recoverableTotal: number
  environment: string
}

const HISTORY_KEY = 'reclaim.audit.history.v1'

function readAll(): AuditHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as AuditHistoryEntry[]) : []
  } catch {
    return []
  }
}

function writeAll(entries: AuditHistoryEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries))
  } catch {
    // Storage full or unavailable — the current session still works.
  }
}

function statusFor(env: LedgerEnvironment): AuditStatus {
  const summary = overviewSummary(env)
  if (summary.readyToVerifyCount + summary.needsContextCount + summary.worthNotingCount === 0) return 'new'
  if (summary.recoveryActiveCount > 0) return 'in_review'
  return 'complete'
}

export function listHistory(userId: string): AuditHistoryEntry[] {
  return readAll()
    .filter((entry) => entry.userId === userId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

function randomId(): string {
  return `audit_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

/** Saves the current environment as a new history entry and returns it. */
export function saveToHistory(userId: string, name: string, env: LedgerEnvironment): AuditHistoryEntry {
  const entry: AuditHistoryEntry = {
    id: randomId(),
    userId,
    name: name.trim() || 'Untitled audit',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: statusFor(env),
    recordCount: env.records.length,
    findingsCount: env.result.findings.length,
    recoverableTotal: env.result.recoverableTotal,
    environment: serializeEnvironment(env),
  }
  writeAll([...readAll(), entry])
  return entry
}

/** Updates an existing history entry's snapshot (e.g. after further review). */
export function updateHistoryEntry(id: string, env: LedgerEnvironment): void {
  const all = readAll()
  const index = all.findIndex((entry) => entry.id === id)
  if (index === -1) return
  const next = [...all]
  next[index] = {
    ...next[index],
    updatedAt: Date.now(),
    status: statusFor(env),
    recordCount: env.records.length,
    findingsCount: env.result.findings.length,
    recoverableTotal: env.result.recoverableTotal,
    environment: serializeEnvironment(env),
  }
  writeAll(next)
}

export function renameHistoryEntry(id: string, name: string): void {
  const all = readAll()
  const index = all.findIndex((entry) => entry.id === id)
  if (index === -1) return
  const next = [...all]
  next[index] = { ...next[index], name: name.trim() || next[index].name, updatedAt: Date.now() }
  writeAll(next)
}

export function deleteHistoryEntry(id: string): void {
  writeAll(readAll().filter((entry) => entry.id !== id))
}

export function loadHistoryEnvironment(id: string): LedgerEnvironment | null {
  const entry = readAll().find((item) => item.id === id)
  if (!entry) return null
  try {
    return deserializeEnvironment(entry.environment)
  } catch {
    return null
  }
}

export function getHistoryEntry(id: string): AuditHistoryEntry | null {
  return readAll().find((item) => item.id === id) ?? null
}
