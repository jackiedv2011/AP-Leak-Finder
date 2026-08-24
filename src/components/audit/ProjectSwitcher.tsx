import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, ChevronDown } from 'lucide-react'
import type { LedgerProjectSummary } from '@/ledger/projects'

interface ProjectSwitcherProps {
  projects: LedgerProjectSummary[]
  value: string
  onValueChange: (projectId: string) => void
}

const POPOVER_EASE = [0.23, 1, 0.32, 1] as const

export function ProjectSwitcher({ projects, value, onValueChange }: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [openedWithKeyboard, setOpenedWithKeyboard] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const reduceMotion = useReducedMotion()
  const selectedProject = projects.find((project) => project.id === value) ?? projects[0]
  const menuId = 'audit-project-switcher-menu'

  useEffect(() => {
    if (!open) return

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    window.addEventListener('pointerdown', closeOnOutsidePress)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePress)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  useEffect(() => {
    if (!open || !openedWithKeyboard) return
    const selectedIndex = Math.max(0, projects.findIndex((project) => project.id === value))
    const frame = window.requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open, openedWithKeyboard, projects, value])

  const openFromKeyboard = () => {
    setOpenedWithKeyboard(true)
    setOpen(true)
  }

  const selectProject = (projectId: string) => {
    onValueChange(projectId)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openFromKeyboard()
    }
  }

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = (index + direction + projects.length) % projects.length
      optionRefs.current[nextIndex]?.focus()
    }
    if (event.key === 'Home') {
      event.preventDefault()
      optionRefs.current[0]?.focus()
    }
    if (event.key === 'End') {
      event.preventDefault()
      optionRefs.current[projects.length - 1]?.focus()
    }
  }

  if (!selectedProject) return null

  const shouldAnimate = !reduceMotion && !openedWithKeyboard

  return (
    <div className="audit-project-switcher" ref={rootRef}>
      <button
        ref={triggerRef}
        className="audit-project-switcher-trigger"
        data-open={open}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setOpenedWithKeyboard(false)
          setOpen((current) => !current)
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="audit-project-switcher-copy">
          <span className="audit-project-switcher-label">Review source</span>
          <span className="audit-project-switcher-value">{selectedProject.name}</span>
        </span>
        <motion.span
          className="audit-project-switcher-chevron"
          aria-hidden="true"
          animate={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: POPOVER_EASE }}
        >
          <ChevronDown strokeWidth={1.8} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={menuId}
            className="audit-project-switcher-menu"
            role="listbox"
            aria-label="Available local reviews"
            initial={shouldAnimate ? { opacity: 0, transform: 'translate3d(0, -5px, 0) scale(0.985)' } : false}
            animate={{ opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }}
            exit={shouldAnimate ? { opacity: 0, transform: 'translate3d(0, -3px, 0) scale(0.99)' } : { opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: POPOVER_EASE }}
          >
            <div className="audit-project-switcher-menu-heading">
              <span>Local reviews</span>
              <span>{projects.length}</span>
            </div>
            <div className="audit-project-switcher-options">
              {projects.map((project, index) => {
                const selected = project.id === value
                return (
                  <button
                    ref={(node) => { optionRefs.current[index] = node }}
                    key={project.id}
                    className="audit-project-switcher-option"
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => selectProject(project.id)}
                    onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  >
                    <span>{project.name}</span>
                    {selected && <Check aria-label="Current review" strokeWidth={2} />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
