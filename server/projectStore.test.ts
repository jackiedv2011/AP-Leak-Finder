// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './db.ts'
import { ProjectStore } from './projectStore.ts'

const MARKER = 'Zyxwv Plaintext Supplies LLC'
const project = (id: string, vendor = MARKER) => ({
  id,
  name: `${vendor} audit`,
  sourceLabel: `${vendor}.csv`,
  mode: 'upload',
  updatedAt: 5,
  environment: { records: [{ id: 'r1', vendor, invoiceNumber: 'INV-1', amountPaid: 1250, paymentDate: '2026-08-01' }], result: { findings: [] } },
})

let dir: string
let path: string
let db: DatabaseSync
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'reclaim-store-'))
  path = join(dir, 'reclaim.sqlite')
  db = openDatabase(path)
  for (const id of ['u1', 'u2']) db.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, 1)').run(id, `${id}@example.com`)
})
afterEach(() => {
  try {
    db.close()
  } catch {
    // already closed by the test
  }
  rmSync(dir, { recursive: true, force: true })
})

/** Every byte SQLite has on disk for this database: the file, its WAL and shared memory. */
const onDisk = () => ['', '-wal', '-shm'].map((suffix) => path + suffix).filter(existsSync).map((file) => readFileSync(file).toString('latin1')).join('')
const rawPayload = (userId: string, id: string) => (db.prepare('SELECT payload, name, source_label FROM projects WHERE user_id = ? AND id = ?').get(userId, id) as { payload: string; name: string; source_label: string })
const insertPlain = (userId: string, p: ReturnType<typeof project>) =>
  db.prepare("INSERT INTO projects (user_id, id, name, source_label, mode, created_at, updated_at, payload) VALUES (?, ?, ?, ?, 'upload', 1, 1, ?)").run(userId, p.id, p.name, p.sourceLabel, JSON.stringify(p))

describe('ProjectStore with DATA_KEY', () => {
  const key = randomBytes(32)

  it('stores audits sealed, names included, and reads them back', () => {
    const store = new ProjectStore(db, { current: key, previous: null })
    store.upsert('u1', project('p1'))
    const raw = rawPayload('u1', 'p1')
    expect(raw.payload.startsWith('v1.')).toBe(true)
    expect(raw.payload).not.toContain(MARKER)
    expect(raw.name).toBe('')
    expect(raw.source_label).toBe('')
    expect(store.get('u1', 'p1')).toEqual(project('p1'))
    expect(store.list('u1')).toEqual([project('p1')])
  })

  it('binds each payload to its account and audit: a copied row does not open', () => {
    const store = new ProjectStore(db, { current: key, previous: null })
    store.upsert('u1', project('p1'))
    const sealed = rawPayload('u1', 'p1').payload
    db.prepare("INSERT INTO projects (user_id, id, name, source_label, mode, created_at, updated_at, payload) VALUES ('u2', 'p1', '', '', 'upload', 1, 1, ?)").run(sealed)
    db.prepare("INSERT INTO projects (user_id, id, name, source_label, mode, created_at, updated_at, payload) VALUES ('u1', 'p2', '', '', 'upload', 1, 1, ?)").run(sealed)
    expect(() => store.get('u2', 'p1')).toThrow()
    expect(() => store.get('u1', 'p2')).toThrow()
  })

  it('reads old plain rows before migrating, then seals them and leaves no plaintext on disk', () => {
    insertPlain('u1', project('p1'))
    insertPlain('u2', project('p2'))
    db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').run()
    expect(onDisk()).toContain(MARKER)

    const store = new ProjectStore(db, { current: key, previous: null })
    expect(store.get('u1', 'p1')).toEqual(project('p1'))
    expect(store.migrate()).toBe(2)
    expect(rawPayload('u1', 'p1').payload.startsWith('v1.')).toBe(true)
    expect(store.get('u2', 'p2')).toEqual(project('p2'))
    expect(onDisk()).not.toContain(MARKER)
    expect(store.migrate()).toBe(0)

    db.close()
    expect(onDisk()).not.toContain(MARKER)
  })

  it('rotates: rows under DATA_KEY_PREVIOUS read during the rotation and are re-sealed under the new key', () => {
    const next = randomBytes(32)
    new ProjectStore(db, { current: key, previous: null }).upsert('u1', project('p1'))
    insertPlain('u1', project('p2'))

    const rotating = new ProjectStore(db, { current: next, previous: key })
    expect(rotating.get('u1', 'p1')).toEqual(project('p1'))
    expect(rotating.migrate()).toBe(2)
    expect(new ProjectStore(db, { current: next, previous: null }).list('u1')).toHaveLength(2)
    expect(() => new ProjectStore(db, { current: key, previous: null }).get('u1', 'p1')).toThrow()
  })

  it('refuses the wrong key rather than returning garbage', () => {
    new ProjectStore(db, { current: key, previous: null }).upsert('u1', project('p1'))
    expect(() => new ProjectStore(db, { current: randomBytes(32), previous: null }).list('u1')).toThrow()
  })
})

describe('ProjectStore without a key (development)', () => {
  it('stores plain JSON as before', () => {
    const store = new ProjectStore(db, null)
    store.upsert('u1', project('p1'))
    expect(JSON.parse(rawPayload('u1', 'p1').payload)).toEqual(project('p1'))
    expect(store.migrate()).toBe(0)
  })

  it('says why a sealed audit cannot be read', () => {
    new ProjectStore(db, { current: randomBytes(32), previous: null }).upsert('u1', project('p1'))
    expect(() => new ProjectStore(db, null).get('u1', 'p1')).toThrow(/DATA_KEY is not set/)
  })
})

describe('deleting', () => {
  it('zeroes a deleted audit instead of leaving it in free pages', () => {
    const store = new ProjectStore(db, null)
    store.upsert('u1', project('p1'))
    store.upsert('u1', project('keep', 'Other Vendor'))
    db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').run()
    expect(onDisk()).toContain(MARKER)
    store.delete('u1', 'p1')
    db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').run()
    expect(onDisk()).not.toContain(MARKER)
  })
})
