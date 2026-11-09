// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupDatabase } from './backup.ts'
import { CaseCommands } from './caseCommands.ts'
import { openDatabase } from './db.ts'
import { ProjectStore } from './projectStore.ts'
import { authorizedProject } from './testProject.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'reclaim-backup-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('backupDatabase', () => {
  it('copies a live database, including writes still in the WAL, to a dated file', () => {
    const path = join(dir, 'reclaim.sqlite')
    const live = openDatabase(path)
    live.prepare("INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@example.com', 1)").run()

    const { file, bytes } = backupDatabase(path, join(dir, 'backups'), new Date('2026-10-17T09:30:00.123Z'))
    expect(file).toBe(join(dir, 'backups', 'reclaim-2026-10-17T09-30-00-123Z.sqlite'))
    expect(bytes).toBeGreaterThan(0)

    // The server keeps writing while the copy stays as it was.
    live.prepare("INSERT INTO users (id, email, created_at) VALUES ('u2', 'b@example.com', 2)").run()
    live.close()

    const copy = new DatabaseSync(file, { readOnly: true })
    expect(copy.prepare('SELECT email FROM users ORDER BY id').all()).toEqual([{ email: 'a@example.com' }])
    copy.close()
  })

  it('restores: the backup opens as a working Reclaim database', () => {
    const path = join(dir, 'reclaim.sqlite')
    const live = openDatabase(path)
    live.prepare("INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@example.com', 1)").run()
    live.close()
    const { file } = backupDatabase(path, dir)

    const restored = openDatabase(file)
    expect(restored.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 1 })
    restored.close()
  })

  it('restores an encrypted project from a copied backup with its retained data key', () => {
    const path = join(dir, 'reclaim.sqlite')
    const live = openDatabase(path)
    const key = randomBytes(32)
    const project = { id: 'p1', name: 'Private supplier audit', sourceLabel: 'private.csv', mode: 'upload', environment: { records: [{ id: 'r1', amountPaid: 1250 }] } }
    live.prepare("INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@example.com', 1)").run()
    new ProjectStore(live, { current: key, previous: null }).upsert('u1', project)

    const { file } = backupDatabase(path, join(dir, 'backups'))
    live.close()
    const restoredPath = join(dir, 'restored.sqlite')
    copyFileSync(file, restoredPath)
    expect(readFileSync(restoredPath).toString('latin1')).not.toContain(project.name)

    const restored = openDatabase(restoredPath)
    try {
      expect(new ProjectStore(restored, { current: key, previous: null }).get('u1', 'p1')).toEqual(project)
      expect(() => new ProjectStore(restored, { current: randomBytes(32), previous: null }).get('u1', 'p1')).toThrow()
    } finally {
      restored.close()
    }
  })

  it('migrates a restored pre-command case while leaving the backup unchanged for rollback', () => {
    const path = join(dir, 'reclaim.sqlite')
    const key = randomBytes(32)
    const live = openDatabase(path)
    live.prepare("INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@example.com', 1)").run()
    const { project, findingId } = authorizedProject('legacy', { vendor: 'Acme', invoice: 'INV-1', amount: 100, requested: 100 })
    new ProjectStore(live, { current: key, previous: null }).upsert('u1', project)
    const { file } = backupDatabase(path, join(dir, 'backups'))
    const backupBytes = readFileSync(file)
    live.close()

    const restoredPath = join(dir, 'restored.sqlite')
    copyFileSync(file, restoredPath)
    const restored = openDatabase(restoredPath)
    try {
      const projects = new ProjectStore(restored, { current: key, previous: null })
      expect(new CaseCommands(restored, projects).migrateLegacy()).toBe(1)
      const state = (projects.get('u1', 'legacy')!.environment as { caseStates: Record<string, { requiresRevalidation?: boolean; legacyApprovedAt?: number; approvedAt?: number | null }> }).caseStates[findingId]
      expect(state).toMatchObject({ requiresRevalidation: true, approvedAt: null, legacyApprovedAt: 100 })
      expect(restored.prepare('SELECT action FROM case_events').all()).toEqual([{ action: 'legacy_assertion' }])
    } finally {
      restored.close()
    }

    expect(readFileSync(file).equals(backupBytes)).toBe(true)
    const rollbackPath = join(dir, 'rollback.sqlite')
    copyFileSync(file, rollbackPath)
    const originalBackup = openDatabase(rollbackPath)
    try {
      const state = (new ProjectStore(originalBackup, { current: key, previous: null }).get('u1', 'legacy')!.environment as { caseStates: Record<string, { requiresRevalidation?: boolean }> }).caseStates[findingId]
      expect(state.requiresRevalidation).toBeUndefined()
      expect(originalBackup.prepare('SELECT COUNT(*) AS n FROM case_events').get()).toEqual({ n: 0 })
    } finally {
      originalBackup.close()
    }
  })

  it('refuses a missing database instead of backing up an empty one', () => {
    expect(() => backupDatabase(join(dir, 'nope.sqlite'), dir)).toThrow(/No database/)
  })

  it('never overwrites an existing backup', () => {
    const path = join(dir, 'reclaim.sqlite')
    openDatabase(path).close()
    const now = new Date('2026-10-17T09:30:00Z')
    writeFileSync(join(dir, 'reclaim-2026-10-17T09-30-00-000Z.sqlite'), 'older')
    expect(() => backupDatabase(path, dir, now)).toThrow(/already exists/)
  })
})
