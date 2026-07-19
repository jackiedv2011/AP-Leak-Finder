import { ArrowUpRight } from 'lucide-react'
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, type HTMLMotionProps } from 'motion/react'
import { useRef, type ReactNode } from 'react'

type MagneticLinkProps = Omit<HTMLMotionProps<'a'>, 'children' | 'style'> & {
  children: ReactNode
}

const magneticSpring = {
  damping: 22,
  mass: 0.42,
  stiffness: 360,
}

export function MagneticLink({ children, className = '', onPointerLeave, onPointerMove, ...props }: MagneticLinkProps) {
  const linkRef = useRef<HTMLAnchorElement>(null)
  const reduceMotion = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, magneticSpring)
  const springY = useSpring(y, magneticSpring)
  const transform = useMotionTemplate`translate3d(${springX}px, ${springY}px, 0)`

  const resetPosition = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.a
      {...props}
      ref={linkRef}
      className={`magnetic-control ${className}`}
      style={reduceMotion ? undefined : { transform }}
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
        <span>{children}</span>
        <span className="magnetic-control-icon" aria-hidden="true"><ArrowUpRight size={15} strokeWidth={1.8} /></span>
      </span>
    </motion.a>
  )
}
