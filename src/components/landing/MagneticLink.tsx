import { ArrowUpRight } from 'lucide-react'
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, type HTMLMotionProps } from 'motion/react'
import { useRef, useState, type ReactNode, type MouseEvent } from 'react'

type MagneticLinkProps = Omit<HTMLMotionProps<'a'>, 'children' | 'style'> & {
  children: ReactNode
  /**
   * When set, a plain left-click briefly swaps the label to this text and
   * registers the press (so the destination feels entered, not teleported
   * to) before following `href`. Full page navigations still happen — this
   * only smooths the moment right before they do.
   */
  pendingLabel?: string
}

const magneticSpring = {
  damping: 22,
  mass: 0.42,
  stiffness: 360,
}

const PENDING_NAVIGATE_DELAY_MS = 260

export function MagneticLink({
  children,
  className = '',
  pendingLabel,
  href,
  onClick,
  onPointerLeave,
  onPointerMove,
  ...props
}: MagneticLinkProps) {
  const linkRef = useRef<HTMLAnchorElement>(null)
  const reduceMotion = useReducedMotion()
  const [isPending, setIsPending] = useState(false)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, magneticSpring)
  const springY = useSpring(y, magneticSpring)
  const transform = useMotionTemplate`translate3d(${springX}px, ${springY}px, 0)`

  const resetPosition = () => {
    x.set(0)
    y.set(0)
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (event.defaultPrevented || !pendingLabel || !href) return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (isPending) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    setIsPending(true)
    window.setTimeout(() => {
      window.location.href = href
    }, PENDING_NAVIGATE_DELAY_MS)
  }

  return (
    <motion.a
      {...props}
      href={href}
      ref={linkRef}
      className={`magnetic-control ${className}`}
      style={reduceMotion ? undefined : { transform }}
      aria-disabled={isPending || undefined}
      onClick={handleClick}
      onPointerMove={(event) => {
        onPointerMove?.(event)
        if (reduceMotion || event.pointerType !== 'mouse') return

        const bounds = linkRef.current?.getBoundingClientRect()
        if (!bounds) return

        x.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 8)
        y.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 6)
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event)
        resetPosition()
      }}
    >
      <span className="magnetic-control-surface">
        <span>{isPending && pendingLabel ? pendingLabel : children}</span>
        <span className="magnetic-control-icon" aria-hidden="true"><ArrowUpRight size={15} strokeWidth={1.8} /></span>
      </span>
    </motion.a>
  )
}
