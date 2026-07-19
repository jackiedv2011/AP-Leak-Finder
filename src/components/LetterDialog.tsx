import { useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Finding } from '@/types'
import { generateLetter } from '@/lib/letters'
import { Copy, Download, Check } from 'lucide-react'

interface LetterDialogProps {
  finding: Finding | null
  onClose: () => void
}

type CopyState = 'idle' | 'copied' | 'manual'

export function LetterDialog({ finding, onClose }: LetterDialogProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const preRef = useRef<HTMLPreElement>(null)

  const letter = useMemo(() => (finding ? generateLetter(finding) : null), [finding])
  const isInternal = finding?.class !== 'recoverable'

  function flashCopied() {
    setCopyState('copied')
    setTimeout(() => setCopyState('idle'), 2000)
  }

  /** Selects the letter text so the user can copy it manually (Cmd/Ctrl+C). */
  function selectLetterText() {
    if (!preRef.current) return
    const range = document.createRange()
    range.selectNodeContents(preRef.current)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  async function handleCopy() {
    if (!letter) return

    try {
      await navigator.clipboard.writeText(letter.body)
      flashCopied()
      return
    } catch {
      // Clipboard API can be blocked by permissions policy — select the text
      // in place instead. (Avoid a detached textarea + execCommand fallback:
      // moving focus outside the dialog's content breaks Radix's focus trap
      // and dismisses the dialog.)
      selectLetterText()
      setCopyState('manual')
    }
  }

  function handleDownload() {
    if (!letter || !finding) return
    const blob = new Blob([letter.body], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${finding.type}-${finding.vendor.replace(/\s+/g, '-').toLowerCase()}-letter.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog
      open={finding !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopyState('idle')
          onClose()
        }
      }}
    >
      {finding && letter && (
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isInternal ? 'Internal review note' : 'Recovery letter'}</DialogTitle>
            <DialogDescription>{letter.subject}</DialogDescription>
          </DialogHeader>

          <pre
            ref={preRef}
            className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-md border border-hairline bg-secondary/50 p-4 font-sans text-sm text-ink"
          >
            {letter.body}
          </pre>

          {copyState === 'manual' && (
            <p className="text-xs text-muted-foreground">
              Clipboard access is blocked here — the letter text is selected, so press Cmd/Ctrl+C to copy it.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleCopy}>
              {copyState === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copyState === 'copied' ? 'Copied' : copyState === 'manual' ? 'Select for copy' : 'Copy to clipboard'}
            </Button>
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Download .txt
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
