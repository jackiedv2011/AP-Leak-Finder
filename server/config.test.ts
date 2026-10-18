// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

const tokenKey = Buffer.alloc(32, 7).toString('base64')
/** The smallest environment a production server accepts. */
const dataKey = Buffer.alloc(32, 9).toString('base64')
const prod = { NODE_ENV: 'production', APP_ORIGIN: 'https://app.reclaim.example', RESEND_API_KEY: 're_test', EMAIL_FROM: 'Reclaim <no-reply@reclaim.example>', DATA_KEY: dataKey }

describe('production startup checks', () => {
  it('starts with an https origin and a real email provider', () => {
    const config = loadConfig(prod)
    expect(config.production).toBe(true)
    expect(config.appOrigin).toBe('https://app.reclaim.example')
    expect(config.devMailbox).toBe(false)
    expect(config.quickbooks).toBeNull()
  })

  it('accepts Gmail as the email provider instead of Resend', () => {
    const { RESEND_API_KEY: _key, EMAIL_FROM: _from, ...rest } = prod
    expect(loadConfig({ ...rest, GMAIL_USER: 'reclaim@example.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' }).gmail).not.toBeNull()
  })

  it('refuses a missing APP_ORIGIN rather than defaulting to localhost', () => {
    const { APP_ORIGIN: _origin, ...rest } = prod
    expect(() => loadConfig(rest)).toThrow(/APP_ORIGIN is not set/)
  })

  it.each(['http://app.reclaim.example', 'https://app.reclaim.example/app', 'https://app.reclaim.example?x=1', 'app.reclaim.example', 'ftp://app.reclaim.example'])('refuses APP_ORIGIN=%s', (origin) => {
    expect(() => loadConfig({ ...prod, APP_ORIGIN: origin })).toThrow(/APP_ORIGIN must be an https/)
  })

  it('allows plain http only for a local production check with SESSION_COOKIE_SECURE_OK', () => {
    expect(loadConfig({ ...prod, APP_ORIGIN: 'http://localhost:8799', SESSION_COOKIE_SECURE_OK: '1' }).appOrigin).toBe('http://localhost:8799')
    expect(() => loadConfig({ ...prod, APP_ORIGIN: 'http://localhost:8799' })).toThrow(/https/)
    expect(() => loadConfig({ ...prod, APP_ORIGIN: 'http://app.reclaim.example', SESSION_COOKIE_SECURE_OK: '1' })).toThrow(/https/)
  })

  it('refuses to start without a real email provider', () => {
    const { RESEND_API_KEY: _key, EMAIL_FROM: _from, ...rest } = prod
    expect(() => loadConfig(rest)).toThrow(/No email provider/)
    expect(() => loadConfig({ ...rest, RESEND_API_KEY: '   ', EMAIL_FROM: '' })).toThrow(/No email provider/)
  })

  it('names a half-configured email provider', () => {
    expect(() => loadConfig({ ...prod, EMAIL_FROM: '' })).toThrow(/RESEND_API_KEY and EMAIL_FROM, or neither/)
    expect(() => loadConfig({ ...prod, GMAIL_USER: 'reclaim@example.com' })).toThrow(/GMAIL_USER and GMAIL_APP_PASSWORD, or neither/)
  })

  it('refuses DEV_MAILBOX unless it is unset or false', () => {
    expect(() => loadConfig({ ...prod, DEV_MAILBOX: 'true' })).toThrow(/DEV_MAILBOX/)
    expect(() => loadConfig({ ...prod, DEV_MAILBOX: '1' })).toThrow(/DEV_MAILBOX/)
    expect(loadConfig({ ...prod, DEV_MAILBOX: 'false' }).devMailbox).toBe(false)
  })

  it('accepts QuickBooks with all three settings, or none (empty values count as none)', () => {
    expect(loadConfig({ ...prod, QBO_CLIENT_ID: 'id', QBO_CLIENT_SECRET: 'secret', QBO_TOKEN_KEY: tokenKey }).quickbooks?.clientId).toBe('id')
    expect(loadConfig({ ...prod, QBO_CLIENT_ID: '', QBO_CLIENT_SECRET: '', QBO_TOKEN_KEY: '' }).quickbooks).toBeNull()
  })

  it.each([
    [{ QBO_CLIENT_ID: 'id' }, 'QBO_CLIENT_SECRET, QBO_TOKEN_KEY'],
    [{ QBO_CLIENT_ID: 'id', QBO_CLIENT_SECRET: 'secret' }, 'QBO_TOKEN_KEY'],
    [{ QBO_TOKEN_KEY: tokenKey }, 'QBO_CLIENT_ID, QBO_CLIENT_SECRET'],
  ])('refuses half-configured QuickBooks %o', (qbo, missing) => {
    expect(() => loadConfig({ ...prod, ...qbo })).toThrow(`QuickBooks is half configured: ${missing} missing`)
  })

  it('refuses to start without DATA_KEY, or with the QuickBooks key reused as it', () => {
    const { DATA_KEY: _key, ...rest } = prod
    expect(() => loadConfig(rest)).toThrow(/DATA_KEY is not set/)
    expect(() => loadConfig({ ...prod, QBO_CLIENT_ID: 'id', QBO_CLIENT_SECRET: 'secret', QBO_TOKEN_KEY: dataKey })).toThrow(/DATA_KEY must be different/)
    expect(loadConfig(prod).dataKeys?.current.equals(Buffer.from(dataKey, 'base64'))).toBe(true)
  })

  it('lists every problem at once, without echoing any value', () => {
    let message = ''
    try {
      loadConfig({ NODE_ENV: 'production', APP_ORIGIN: 'http://app.reclaim.example', DEV_MAILBOX: 'true', QBO_CLIENT_SECRET: 'super-secret-value' })
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/APP_ORIGIN must be an https/)
    expect(message).toMatch(/No email provider/)
    expect(message).toMatch(/DEV_MAILBOX/)
    expect(message).toMatch(/QuickBooks is half configured/)
    expect(message).not.toContain('super-secret-value')
  })

  it('checks the data keys everywhere: 32 bytes, and no previous key without a current one', () => {
    expect(() => loadConfig({ DATA_KEY: 'c2hvcnQ=' })).toThrow(/DATA_KEY must be 32 random bytes/)
    expect(() => loadConfig({ DATA_KEY_PREVIOUS: dataKey })).toThrow(/without DATA_KEY/)
    const previous = Buffer.alloc(32, 1).toString('base64')
    expect(loadConfig({ DATA_KEY: dataKey, DATA_KEY_PREVIOUS: previous }).dataKeys?.previous?.length).toBe(32)
    expect(loadConfig({ DATA_KEY: dataKey, DATA_KEY_PREVIOUS: dataKey }).dataKeys?.previous).toBeNull()
    expect(loadConfig({}).dataKeys).toBeNull()
  })

  it('applies none of this outside production', () => {
    const config = loadConfig({ NODE_ENV: 'development', QBO_CLIENT_ID: 'id' })
    expect(config.production).toBe(false)
    expect(config.appOrigin).toBe('http://localhost:8787')
    expect(config.quickbooks).toBeNull()
  })
})
