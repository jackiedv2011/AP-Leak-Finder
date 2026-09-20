import { EVIDENCE_LABEL, type Opportunity } from '../selectors'

/** Evidence strength as three filled rules and a word — never a percentage. */
export function Strength({ level }: { level: Opportunity['evidence'] }) {
  return (
    <span className="wk-strength" data-level={level}>
      <span className="wk-strength-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>{EVIDENCE_LABEL[level]}</span>
    </span>
  )
}
