export const MOTION_EASE = {
  out: [0.23, 1, 0.32, 1],
  move: [0.77, 0, 0.175, 1],
} as const

export const MOTION_SPRING = {
  compact: { type: 'spring', bounce: 0, duration: 0.24 },
  scene: { type: 'spring', bounce: 0, duration: 0.36 },
  shared: { type: 'spring', bounce: 0, duration: 0.42 },
} as const

export const MOTION_TRANSITION = {
  enter: { duration: 0.28, ease: MOTION_EASE.out },
  exit: { duration: 0.18, ease: MOTION_EASE.out },
  state: { duration: 0.2, ease: MOTION_EASE.out },
} as const

export const sceneVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    transform: `translate3d(${direction === 0 ? 0 : direction * 12}px, 0, 0)`,
    filter: 'blur(2px)',
  }),
  center: { opacity: 1, transform: 'translate3d(0, 0, 0)', filter: 'blur(0px)' },
  exit: (direction: number) => ({
    opacity: 0,
    transform: `translate3d(${direction === 0 ? 0 : direction * -8}px, 0, 0)`,
    filter: 'blur(1.5px)',
  }),
}
