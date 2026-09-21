import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'

const config = loadConfig()
mkdirSync(dirname(resolve(config.databasePath)), { recursive: true })
const app = createApp({ config, staticDir: config.production ? resolve('dist') : null })
const port = await app.listen()
console.log(`Reclaim API listening on http://localhost:${port}`)
console.log(`  email delivery: ${app.mailer.kind}${config.devMailbox ? ' (dev mailbox at /api/dev/mailbox)' : ''}`)
console.log(`  google sign-in: ${config.google ? 'configured' : 'not configured'}`)
console.log(`  ai drafting:    ${config.anthropicApiKey ? config.anthropicModel : 'not configured'}`)
