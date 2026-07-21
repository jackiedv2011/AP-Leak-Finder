interface IngestStatusProps {
  label: string
}

/**
 * Shown only for as long as ingest genuinely takes — no staged pageant, no
 * manufactured minimum duration. For a typical file this is imperceptible;
 * for a large one it's an honest "this is still reading" signal.
 */
export function IngestStatus({ label }: IngestStatusProps) {
  return (
    <div className="audit-ingest" role="status" aria-live="polite">
      <p>{label}</p>
    </div>
  )
}
