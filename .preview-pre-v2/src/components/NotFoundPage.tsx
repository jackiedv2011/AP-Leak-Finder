import { ReclaimLogo } from '@/components/ReclaimLogo'

/**
 * A misplaced record, drawn the way the rest of Reclaim draws evidence: a paper
 * slip on the same ivory surface as the landing page, with the trail running off
 * the edge of the page.
 */
function LostRecordArt() {
  return (
    <svg
      viewBox="0 0 420 320"
      className="h-auto w-full max-w-[26rem]"
      role="img"
      aria-label="A ledger slip with its payment trail running off the page"
    >
      <defs>
        <linearGradient id="nf-paper" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#fbfaf6" />
          <stop offset="100%" stopColor="#ece7db" />
        </linearGradient>
      </defs>

      {/* Back slip, tilted */}
      <g transform="rotate(-7 210 165)" opacity="0.55">
        <rect x="96" y="60" width="200" height="210" rx="8" fill="url(#nf-paper)" stroke="#171917" strokeOpacity="0.14" />
      </g>

      {/* Front slip */}
      <g transform="rotate(4 210 165)">
        <rect x="112" y="48" width="200" height="214" rx="8" fill="url(#nf-paper)" stroke="#171917" strokeOpacity="0.2" />

        <text x="132" y="82" fill="#7a7d76" fontSize="10" fontWeight="700" letterSpacing="1.6">
          PAYMENT RECORD
        </text>

        {/* Ruled lines */}
        {[104, 126, 148, 170].map((y, index) => (
          <g key={y}>
            <rect x="132" y={y} width={index === 3 ? 58 : 96} height="7" rx="3.5" fill="#171917" opacity="0.16" />
            <rect x="244" y={y} width={index === 3 ? 30 : 48} height="7" rx="3.5" fill="#171917" opacity="0.1" />
          </g>
        ))}

        {/* The missing line */}
        <rect x="132" y="196" width="142" height="26" rx="5" fill="#a8762a" opacity="0.12" />
        <rect x="132" y="196" width="3" height="26" rx="1.5" fill="#a8762a" />
        <text x="146" y="213" fill="#8a6222" fontSize="11" fontWeight="600">
          record not found
        </text>
      </g>

      {/* Trail running off the page */}
      <path
        d="M318 168 C348 168 356 132 386 132"
        fill="none"
        stroke="#2c8b58"
        strokeOpacity="0.5"
        strokeWidth="2"
        strokeDasharray="6 7"
        strokeLinecap="round"
      />
      <circle cx="318" cy="168" r="4.5" fill="#73d99a" stroke="#2c8b58" strokeWidth="1.5" />
    </svg>
  )
}

export function NotFoundPage() {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-[#f3efe7] px-6 py-8 text-[#171917] [color-scheme:light]">
      <a
        href="/"
        className="inline-flex w-max rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2c8b58] focus-visible:ring-offset-4 focus-visible:ring-offset-[#f3efe7]"
        aria-label="Reclaim home"
      >
        <ReclaimLogo size={31} interactive />
      </a>

      <div className="m-auto grid w-full max-w-5xl items-center gap-12 pb-16 md:grid-cols-[minmax(0,1fr)_auto]">
        <section>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#7a7d76]">404</p>
          <h1 className="mt-4 max-w-xl text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-6xl">
            This payment trail{' '}
            <em className="font-serif font-normal italic">ends here.</em>
          </h1>
          <p className="mt-6 max-w-md text-pretty leading-7 text-[#5f625d]">
            The page may have moved, or the link is incomplete. Your ledger is untouched — head back and pick the trail
            up again.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              className="rounded-[10px] border border-[rgba(23,25,23,0.26)] bg-[#fbfaf6] px-5 py-3 text-sm font-semibold text-[#171917] transition-colors hover:border-[#171917] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2c8b58] focus-visible:ring-offset-4 focus-visible:ring-offset-[#f3efe7]"
              href="/"
            >
              Back to Reclaim
            </a>
            <a
              className="rounded-[10px] bg-[#101411] px-5 py-3 text-sm font-bold text-[#f6f7f4] transition-colors hover:bg-[#1e2620] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2c8b58] focus-visible:ring-offset-4 focus-visible:ring-offset-[#f3efe7]"
              href="/audit?entry=sample"
            >
              Open the sample review
            </a>
          </div>
        </section>

        <div className="hidden justify-self-center md:block">
          <LostRecordArt />
        </div>
      </div>
    </main>
  )
}
