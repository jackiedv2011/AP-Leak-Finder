// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupDatabase } from './backup.ts'
import { openDatabase } from './db.ts'

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
