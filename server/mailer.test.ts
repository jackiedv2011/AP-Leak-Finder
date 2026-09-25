import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'
import { GmailMailer } from './mailer.ts'

describe('Gmail delivery', () => {
  it('is configured only when both the address and the app password are set', () => {
    expect(loadConfig({ NODE_ENV: 'test', GMAIL_USER: 'reclaimbusiness1@gmail.com' }).gmail).toBeNull()
    expect(loadConfig({ NODE_ENV: 'test', GMAIL_USER: 'reclaimbusiness1@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' }).gmail).toEqual({
      user: 'reclaimbusiness1@gmail.com',
      appPassword: 'abcd efgh ijkl mnop',
    })
  })

  it('reports a failed send without echoing the server reply', async () => {
    const mailer = new GmailMailer('nobody@example.invalid', 'wrong-password')
    // Swap in a failing transport so the test never touches the network.
    ;(mailer as unknown as { transport: { sendMail: () => Promise<never> } }).transport = { sendMail: () => Promise.reject(new Error('535 bad credentials wrong-password')) }
    await expect(mailer.send({ to: 'a@b.test', subject: 's', body: 'b' })).rejects.toThrow(/^Email delivery failed \(gmail\)$/)
  })
})
