import { ReclaimLogo } from '@/components/ReclaimLogo'

export function NotFoundPage() {
  return (
    <main className="route-dark flex min-h-[100dvh] flex-col bg-[#090b0c] px-6 py-8 text-[#eef1ec] [color-scheme:dark]">
      <a
        href="/"
        className="inline-flex w-max rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79d99b] focus-visible:ring-offset-4 focus-visible:ring-offset-[#090b0c]"
        aria-label="Reclaim home"
      >
        <ReclaimLogo size={31} interactive />
      </a>
      <section className="m-auto w-full max-w-3xl pb-16">
        <p className="text-sm font-semibold text-[#7f8983]">404</p>
        <h1 className="mt-5 max-w-2xl text-balance text-5xl font-semibold tracking-[-0.055em] sm:text-7xl">
          This payment trail ends here.
        </h1>
        <p className="mt-6 max-w-xl text-pretty leading-7 text-[#aeb7b1]">
          The page does not exist. Return to Reclaim or open the sample audit.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a className="rounded-[10px] bg-[#eef0eb] px-5 py-3 text-sm font-bold text-[#151a17] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79d99b] focus-visible:ring-offset-4 focus-visible:ring-offset-[#090b0c]" href="/">
            Return home
          </a>
          <a className="rounded-[10px] px-5 py-3 text-sm font-semibold text-[#cbd2cd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79d99b] focus-visible:ring-offset-4 focus-visible:ring-offset-[#090b0c]" href="/audit?entry=sample">
            Open sample audit
          </a>
        </div>
      </section>
    </main>
  )
}
