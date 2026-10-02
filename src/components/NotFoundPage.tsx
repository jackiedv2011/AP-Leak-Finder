import { AuthSplit } from '@/pages/AuthSplit'

/** Unknown paths get the account pages' layout: the site's 3D beside the black panel. */
export function NotFoundPage() {
  return (
    <AuthSplit
      title={['Page', 'not found']}
      titleSize="long"
      lede="The page may have moved, or the link is incomplete. Your ledger is untouched."
      alternate={
        <>
          Error 404 · <a href="/">Back to Reclaim</a>
        </>
      }
    >
      <a className="rc-btn" data-theme="green" href="/">
        Back to Reclaim
      </a>
      <a className="rc-btn" data-theme="dark" href="/audit?entry=sample">
        Open the sample review
      </a>
    </AuthSplit>
  )
}
