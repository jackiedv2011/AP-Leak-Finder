import { useState } from 'react'
import { useOptionalAuth } from '@/lib/auth/AuthContext'

type Answer = { answer: string; citations: Array<{ id: string; label: string }>; limitation: string | null }
const SUGGESTIONS = ['Why is this only a check?', 'What evidence is missing?', 'How was this amount calculated?', 'What is the next step?']

/** Questions stay in this component; answers are generated from this account's saved case. */
export function CaseAssistant({ projectId, findingId }: { projectId?: string; findingId: string }) {
  const auth = useOptionalAuth()
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!projectId || !auth?.user || auth.user.isGuest) return null

  const ask = async (value: string) => {
    if (!value.trim() || busy) return
    setQuestion(value)
    setBusy(true)
    setError(null)
    setAnswer(null)
    try {
      const response = await fetch('/api/assistant/ask', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, findingId, question: value }) })
      if (!response.ok) throw new Error(response.status === 404 ? 'This case is not saved to your account yet.' : 'Could not answer from the saved case. Check the account sync status and try again.')
      setAnswer(await response.json() as Answer)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not answer right now.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="wk-panelcard" aria-labelledby="case-assistant-title">
    <div className="wk-panelcard-head"><div><h2 id="case-assistant-title">Ask Reclaim</h2><p>Answers use the saved case and product rules. Nothing here changes the case.</p></div></div>
    <div className="wk-panelcard-body wk-stack">
      <div className="wk-stack" aria-label="Suggested questions">{SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" className="wk-linklike" disabled={busy} onClick={() => void ask(suggestion)}>{suggestion}</button>)}</div>
      <form onSubmit={(event) => { event.preventDefault(); void ask(question) }}>
        <label htmlFor="case-assistant-question" className="wk-label">Your question</label>
        <input id="case-assistant-question" className="wk-input" maxLength={500} value={question} onChange={(event) => setQuestion(event.target.value)} />
        <button className="wk-btn" data-variant="outline" type="submit" disabled={busy || !question.trim()}>{busy ? 'Checking saved records…' : 'Ask'}</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {answer ? <div role="status" className="wk-stack"><p>{answer.answer}</p>{answer.limitation ? <p className="wk-field-hint">{answer.limitation}</p> : null}<div><strong>Sources</strong><ul>{answer.citations.map((citation) => <li key={citation.id}>{citation.label} · {citation.id}</li>)}</ul></div></div> : null}
    </div>
  </section>
}
