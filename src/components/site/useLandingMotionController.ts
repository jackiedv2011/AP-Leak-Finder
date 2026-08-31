import { useEffect, type RefObject } from 'react'

type SceneState = 'dormant' | 'warm' | 'entering' | 'active' | 'settled' | 'sleeping'

type SceneRecord = {
  element: HTMLElement
  markers: HTMLElement[]
  parallaxLayers: HTMLElement[]
  assetsReady: boolean
  decodeStarted: boolean
  entered: boolean
  nearViewport: boolean
  runningAnimations: number
  settleTimer: number
}

type SceneRead = {
  record: SceneRecord
  inViewport: boolean
  progress: number
  revealAttributes: string[]
}

const WARM_MARGIN = '1200px 0px 1200px'
const REVEAL_LINE = 0.92
const SETTLE_FALLBACK_MS = 2300

function setSceneState(scene: HTMLElement, state: SceneState) {
  if (scene.dataset.motionState !== state) scene.dataset.motionState = state
}

function clearParallax(record: SceneRecord) {
  record.element.removeAttribute('data-parallax-active')
  record.parallaxLayers.forEach((layer) => layer.style.removeProperty('translate'))
}

function revealAllMarkers(record: SceneRecord) {
  record.markers.forEach((marker) => {
    const attribute = marker.dataset.motionReveal
    if (attribute) record.element.setAttribute(attribute, '')
  })
}

function decodeScene(record: SceneRecord, requestUpdate: () => void) {
  if (record.decodeStarted) return
  record.decodeStarted = true

  const images = Array.from(record.element.querySelectorAll<HTMLImageElement>('img'))
  if (images.length === 0) {
    record.assetsReady = true
    requestUpdate()
    return
  }

  Promise.allSettled(images.map((image) => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve()
    if (typeof image.decode === 'function') return image.decode()
    return new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true })
      image.addEventListener('error', () => resolve(), { once: true })
    })
  })).then(() => {
    record.assetsReady = true
    requestUpdate()
  })
}

export function useLandingMotionController(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof window === 'undefined') return

    const scenes = Array.from(root.querySelectorAll<HTMLElement>('[data-motion-scene]'))
    const records = new Map<HTMLElement, SceneRecord>()
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const nav = root.querySelector<HTMLElement>('[data-motion-nav]')
    const heroBoundary = root.querySelector<HTMLElement>('[data-hero-boundary]')
    let cachedHeroBoundary = 0
    let previousScrollY = window.scrollY
    let navHidden = false
    let frame = 0

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }

    const armSettleFallback = (record: SceneRecord) => {
      if (record.settleTimer) window.clearTimeout(record.settleTimer)
      record.settleTimer = window.setTimeout(() => {
        record.runningAnimations = 0
        record.settleTimer = 0
        requestUpdate()
      }, SETTLE_FALLBACK_MS)
    }

    const measureHeroBoundary = () => {
      if (!heroBoundary) return
      const hero = heroBoundary.closest<HTMLElement>('[data-motion-scene]')
      cachedHeroBoundary = (hero?.offsetTop ?? 0) + heroBoundary.offsetTop
    }

    const updateNav = (scrollY: number) => {
      if (!nav) return
      const movingDown = scrollY > previousScrollY + 6
      const movingUp = scrollY < previousScrollY - 6
      const passedHero = scrollY >= cachedHeroBoundary

      if (passedHero && movingDown) navHidden = true
      else if (movingUp || scrollY < 64) navHidden = false

      nav.toggleAttribute('data-scrolled', scrollY > 48)
      nav.toggleAttribute('data-hidden', navHidden)
      previousScrollY = scrollY
    }

    function update() {
      frame = 0
      const viewportHeight = window.innerHeight
      const scrollY = window.scrollY
      const reducedMotion = motionQuery.matches
      const reads: SceneRead[] = []

      updateNav(scrollY)

      records.forEach((record) => {
        if (!record.nearViewport) return

        const bounds = record.element.getBoundingClientRect()
        const inViewport = bounds.bottom > 0 && bounds.top < viewportHeight
        const travel = viewportHeight / 2 + bounds.height / 2
        const progress = Math.max(-1, Math.min(1, (bounds.top + bounds.height / 2 - viewportHeight / 2) / travel))
        const revealAttributes: string[] = []

        if (record.assetsReady && inViewport) {
          record.markers.forEach((marker) => {
            const attribute = marker.dataset.motionReveal
            if (!attribute || record.element.hasAttribute(attribute)) return
            const markerBounds = marker === record.element ? bounds : marker.getBoundingClientRect()
            if (markerBounds.top <= viewportHeight * REVEAL_LINE && markerBounds.bottom >= 0) revealAttributes.push(attribute)
          })
        }

        reads.push({ record, inViewport, progress, revealAttributes })
      })

      reads.forEach(({ record, inViewport, progress, revealAttributes }) => {
        if (reducedMotion) {
          revealAllMarkers(record)
          clearParallax(record)
          if (inViewport) setSceneState(record.element, 'active')
          else setSceneState(record.element, record.entered ? 'settled' : 'warm')
          return
        }

        if (inViewport && record.assetsReady && !record.entered) {
          record.entered = true
          record.element.setAttribute('data-motion-entered', '')
          setSceneState(record.element, 'entering')
          armSettleFallback(record)
        }

        if (revealAttributes.length > 0) {
          revealAttributes.forEach((attribute) => record.element.setAttribute(attribute, ''))
          setSceneState(record.element, 'entering')
          armSettleFallback(record)
        }

        if (inViewport && record.assetsReady) {
          record.element.setAttribute('data-parallax-active', '')
          const edgeGuard = 1 - Math.pow(Math.abs(progress), 4)
          record.parallaxLayers.forEach((layer) => {
            const depth = Number.parseFloat(layer.dataset.parallax ?? '0') * 3
            layer.style.translate = `0 ${Math.round(progress * depth * edgeGuard)}px`
          })

          if (record.runningAnimations > 0 || record.settleTimer) setSceneState(record.element, 'entering')
          else setSceneState(record.element, 'active')
        } else {
          clearParallax(record)
          setSceneState(record.element, record.entered ? 'settled' : 'warm')
        }
      })
    }

    scenes.forEach((element) => {
      const priority = element.dataset.motionPriority === 'hero'
      const markers = Array.from(element.querySelectorAll<HTMLElement>('[data-motion-reveal]'))
      if (element.hasAttribute('data-motion-reveal')) markers.push(element)
      const record: SceneRecord = {
        element,
        markers,
        parallaxLayers: Array.from(element.querySelectorAll<HTMLElement>('[data-parallax]')),
        assetsReady: priority,
        decodeStarted: priority,
        entered: priority,
        nearViewport: priority,
        runningAnimations: 0,
        settleTimer: 0,
      }
      records.set(element, record)
      setSceneState(element, priority ? 'entering' : 'dormant')
      if (priority) armSettleFallback(record)
    })

    if (typeof IntersectionObserver === 'undefined') {
      records.forEach((record) => {
        record.nearViewport = true
        record.assetsReady = true
        record.entered = true
        revealAllMarkers(record)
        setSceneState(record.element, 'active')
      })
    }

    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const record = records.get(entry.target as HTMLElement)
        if (!record) return

        record.nearViewport = entry.isIntersecting
        if (entry.isIntersecting) {
          if (!record.entered) setSceneState(record.element, 'warm')
          decodeScene(record, requestUpdate)
        } else {
          clearParallax(record)
          setSceneState(record.element, record.entered ? 'sleeping' : 'dormant')
        }
      })
      requestUpdate()
    }, { rootMargin: WARM_MARGIN, threshold: 0 })

    if (observer) scenes.forEach((scene) => observer.observe(scene))

    const onAnimationStart = (event: AnimationEvent) => {
      const scene = (event.target as Element).closest<HTMLElement>('[data-motion-scene]')
      const record = scene ? records.get(scene) : undefined
      if (!record) return
      record.runningAnimations += 1
      setSceneState(record.element, 'entering')
    }

    const onAnimationFinish = (event: AnimationEvent) => {
      const scene = (event.target as Element).closest<HTMLElement>('[data-motion-scene]')
      const record = scene ? records.get(scene) : undefined
      if (!record) return
      record.runningAnimations = Math.max(0, record.runningAnimations - 1)
      if (record.runningAnimations === 0 && record.settleTimer) {
        window.clearTimeout(record.settleTimer)
        record.settleTimer = 0
      }
      requestUpdate()
    }

    const onResize = () => {
      measureHeroBoundary()
      requestUpdate()
    }

    const onMotionPreferenceChange = () => {
      if (motionQuery.matches) records.forEach((record) => clearParallax(record))
      requestUpdate()
    }

    measureHeroBoundary()
    root.addEventListener('animationstart', onAnimationStart)
    root.addEventListener('animationend', onAnimationFinish)
    root.addEventListener('animationcancel', onAnimationFinish)
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', onResize)
    motionQuery.addEventListener('change', onMotionPreferenceChange)
    requestUpdate()

    return () => {
      observer?.disconnect()
      root.removeEventListener('animationstart', onAnimationStart)
      root.removeEventListener('animationend', onAnimationFinish)
      root.removeEventListener('animationcancel', onAnimationFinish)
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', onResize)
      motionQuery.removeEventListener('change', onMotionPreferenceChange)
      if (frame) window.cancelAnimationFrame(frame)
      records.forEach((record) => {
        if (record.settleTimer) window.clearTimeout(record.settleTimer)
        clearParallax(record)
      })
    }
  }, [rootRef])
}
