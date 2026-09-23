import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { DISMISSAL_TAG_LABEL, type DecisionValue, type DismissalTag } from '@/ledger/caseState'
import type { Finding } from '@/types'
import { formatCurrency } from '@/lib/format'
import '@/workspace/workspace.css'

export interface DecisionInput {
  decision: DecisionValue
  reason: string | null
  dismissalTag: DismissalTag | null
}

interface DecisionDialogProps {
  finding: Finding
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (input: DecisionInput) => void
}

const OPTIONS: Array<{ value: DecisionValue; title: string; body: string }> = [
  { value: 'confirmed', title: 'This is real', body: 'The records show money the business should get back. Reclaim will prepare the recovery request next.' },
  { value: 'needs_info', title: 'I need more detail', body: 'Keep it open. Note what you still have to check — a PO, a statement, a word with the vendor.' },
  { value: 'expected', title: 'Not an issue', body: 'This was expected — a split payment, a known arrangement, or a detection mistake. It leaves the open findings.' },
]

/**
 * The one decision a reviewer makes on a finding, asked once, in one place,
 * with room to say why. Nothing is saved until "Save decision".
 */
export function DecisionDialog({ finding, open, onOpenChange, onSave }: DecisionDialogProps) {
  const [decision, setDecision] = useState<DecisionValue>('confirmed')
  const [reason, setReason] = useState('')
  const [tag, setTag] = useState<DismissalTag>('intentional')

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="wk wk-overlay" />
        <DialogPrimitive.Content className="wk wk-panel" style={{ width: 'min(560px, calc(100vw - 32px))' }} data-testid="decision-dialog">
          <header className="wk-panel-head">
            <div>
              <DialogPrimitive.Title className="wk-display wk-h2">Review this finding</DialogPrimitive.Title>
              <DialogPrimitive.Description className="wk-dim">
                {finding.vendor} · {formatCurrency(finding.dollarImpact)}. What do the records tell you?
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="wk-panel-close" aria-label="Close">
              <X aria-hidden="true" />
            </DialogPrimitive.Close>
          </header>

          <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 10 }} role="radiogroup" aria-label="Decision">
            {OPTIONS.map((option) => (
              <label key={option.value} className="wk-choice" data-selected={decision === option.value || undefined}>
                <input type="radio" name="decision" value={option.value} checked={decision === option.value} onChange={() => setDecision(option.value)} />
                <span>
                  <b>{option.title}</b>
                  <span className="wk-dim">{option.value === 'confirmed' && finding.class !== 'recoverable' ? 'Keep this finding for an internal investigation. Reclaim will prepare a note for your team; this does not record recoverable money.' : option.body}</span>
                </span>
              </label>
            ))}

            {decision === 'expected' ? (
              <div className="wk-field" style={{ marginTop: 4 }}>
                <label htmlFor="decision-tag">Why is it expected?</label>
                <select id="decision-tag" className="wk-input" value={tag} onChange={(e) => setTag(e.target.value as DismissalTag)}>
                  {(Object.keys(DISMISSAL_TAG_LABEL) as DismissalTag[]).map((t) => (
                    <option key={t} value={t}>
                      {DISMISSAL_TAG_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="wk-field" style={{ marginTop: 4 }}>
              <label htmlFor="decision-note">{decision === 'needs_info' ? 'What do you still need to check?' : 'Note (optional)'}</label>
              <textarea
                id="decision-note"
                className="wk-input"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={decision === 'needs_info' ? 'e.g. Pull PO 4471 and the March statement' : 'Anything worth remembering about this call'}
                style={{ height: 'auto', minHeight: 80, padding: '10px 12px', lineHeight: 1.5, resize: 'vertical' }}
              />
            </div>
          </div>

          <div className="wk-panel-foot">
            <button type="button" className="wk-btn" data-variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="wk-btn"
              data-variant="primary"
              onClick={() => onSave({ decision, reason: reason.trim() || null, dismissalTag: decision === 'expected' ? tag : null })}
            >
              Save decision
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
