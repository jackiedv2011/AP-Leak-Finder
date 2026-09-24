import type { Finding } from '@/types'

/** A finding's type as a pastel chip, coloured by what kind of money it is. */
export function KindChip({ finding, label }: { finding: Finding; label: string }) {
  return (
    <span className="wk-chip" data-kind={finding.class} title={KIND_LABEL[finding.class]}>
      {label}
    </span>
  )
}

export const KIND_LABEL: Record<Finding['class'], string> = {
  recoverable: 'Money to claim back',
  review: 'Needs more context',
  opportunity: 'Prevention',
}
