import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * A consistent copy of the SQLite file, safe to take while the server is
 * running: `VACUUM INTO` reads one snapshot of the database (WAL included)
 * and writes it to a new, compacted file. The copy is then opened and
 * integrity-checked, so a backup that exists is a backup that restores.
 *
 *   node server/backup.ts                  # DATABASE_PATH → <its folder>/backups/
 *   node server/backup.ts /mnt/offsite     # or into a folder you name
 *
 * The file holds every account and audit. Keep backups off the server and
 * encrypted at rest; see docs/deploy.md.
 */
export function backupDatabase(databasePath: string, outDir: string, now = new Date()): { file: string; bytes: number } {
  const source = resolve(databasePath)
  // Opening a missing path would create an empty database and "back it up".
  if (!existsSync(source)) throw new Error(`No database at ${source}. Check DATABASE_PATH.`)
  mkdirSync(outDir, { recursive: true })
  const file = join(resolve(outDir), `reclaim-${now.toISOString().replace(/[:.]/g, '-')}.sqlite`)
  if (existsSync(file)) throw new Error(`${file} already exists.`)

  const db = new DatabaseSync(source, { timeout: 10_000 })
  try {
    db.prepare('VACUUM INTO ?').run(file)
  } finally {
    db.close()
  }

  const copy = new DatabaseSync(file, { readOnly: true })
  try {
    const result = copy.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
    if (result.integrity_check !== 'ok') throw new Error(`Backup ${file} failed its integrity check: ${result.integrity_check}`)
  } finally {
    copy.close()
  }
  return { file, bytes: statSync(file).size }
}

if (import.meta.main) {
  const databasePath = process.env.DATABASE_PATH ?? './data/reclaim.sqlite'
  const outDir = process.argv[2] ?? process.env.BACKUP_DIR ?? join(dirname(resolve(databasePath)), 'backups')
  try {
    const { file, bytes } = backupDatabase(databasePath, outDir)
    console.log(`backup written: ${file} (${(bytes / 1024).toFixed(0)} KB, integrity ok)`)
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}
