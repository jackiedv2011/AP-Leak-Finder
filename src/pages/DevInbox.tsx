import { useEffect, useState } from 'react'
import { devMailbox } from '@/lib/auth/apiAuthService'
import { useAuth } from '@/lib/auth/AuthContext'

/**
 * Development only. When the server has no email provider it keeps outgoing
 * mail in a local inbox; this shows the link the email would have carried so
 * the verification and reset flows can be walked end to end on a laptop.
 * Renders nothing when the server is configured for real delivery.
 */
export function DevInbox({ email, subjectMatches }: { email: string; subjectMatches: RegExp }) {
  const { providers } = useAuth()
  const [messages, setMessages] = useState<Array<{ subject: string; link: string | null }>>([])

  useEffect(() => {
    if (!providers?.devMailbox || !email) return
    let cancelled = false
    const load = () => devMailbox(email).then((m) => !cancelled && setMessages(m.filter((x) => subjectMatches.test(x.subject))))
    void load()
    const timer = window.setInterval(() => void load(), 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [providers?.devMailbox, email, subjectMatches])

  if (!providers?.devMailbox || messages.length === 0) return null
  const [latest] = messages
  return (
    <div className="wk-token-box" data-testid="dev-inbox">
      <b>Development mode</b> — no email was sent. Here is the link it would have carried:
      <br />
      {latest.link ? <a href={latest.link}>{latest.subject}</a> : latest.subject}
    </div>
  )
}
