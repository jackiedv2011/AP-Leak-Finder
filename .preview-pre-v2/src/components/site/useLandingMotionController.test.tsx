import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLandingMotionController } from './useLandingMotionController'

type ObserverCallback = IntersectionObserverCallback

class ControlledIntersectionObserver implements IntersectionObserver {
  static instances: ControlledIntersectionObserver[] = []

  readonly root = null
  readonly rootMargin = '1200px 0px 1200px'
  readonly scrollMargin = '0px'
  readonly thresholds = [0]
  readonly observed = new Set<Element>()
  disconnected = false
  private readonly callback: ObserverCallback

  constructor(callback: ObserverCallback) {
    this.callback = callback
    ControlledIntersectionObserver.instances.push(this)
  }

  observe = (target: Element) => this.observed.add(target)
  unobserve = (target: Element) => this.observed.delete(target)
  disconnect = () => {
    this.disconnected = true
    this.observed.clear()
  }
  takeRecords = () => []

  emit(target: Element, isIntersecting: boolean) {
    this.callback([
      {
        target,
        isIntersecting,
        intersectionRatio: isIntersecting ? 1 : 0,
        time: 0,
        boundingClientRect: target.getBoundingClientRect(),
        intersectionRect: target.getBoundingClientRect(),
        rootBounds: null,
      } as IntersectionObserverEntry,
    ], this)
  }
}

function Harness() {
  const rootRef = useRef<HTMLElement>(null)
  useLandingMotionController(rootRef)

  return (
    <main ref={rootRef}>
      <nav data-motion-nav />
      <section data-motion-scene data-motion-priority="hero">
        <span data-hero-boundary />
      </section>
      <section data-motion-scene data-testid="scene">
        <span data-motion-reveal="data-copy-revealed" data-testid="marker" />
        <span data-parallax="20" data-testid="layer" />
      </section>
    </main>
  )
}

describe('useLandingMotionController', () => {
  let nextFrame: FrameRequestCallback | null
  let scrollY: number
  let reducedMotion: boolean
  let mediaListeners: Array<() => void>

  beforeEach(() => {
    ControlledIntersectionObserver.instances = []
    nextFrame = null
    scrollY = 0
    reducedMotion = false
    mediaListeners = []

    vi.stubGlobal('IntersectionObserver', ControlledIntersectionObserver)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      nextFrame = callback
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      nextFrame = null
    })
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: reducedMotion,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => mediaListeners.push(listener as () => void),
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        mediaListeners = mediaListeners.filter((item) => item !== listener)
      },
      dispatchEvent: vi.fn(),
    }))
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-hero-boundary') ? 500 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-motion-priority')) {
        return { top: -100, bottom: 900, height: 1000, left: 0, right: 1000, width: 1000, x: 0, y: -100, toJSON() {} }
      }
      if (this.dataset.testid === 'marker') {
        return { top: 240, bottom: 260, height: 20, left: 0, right: 20, width: 20, x: 0, y: 240, toJSON() {} }
      }
      return { top: 100, bottom: 700, height: 600, left: 0, right: 1000, width: 1000, x: 0, y: 100, toJSON() {} }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const flushFrame = () => {
    const callback = nextFrame
    nextFrame = null
    act(() => callback?.(0))
  }

  it('shares one observer, reveals once, and suspends parallax while sleeping', () => {
    const { getByTestId, unmount } = render(<Harness />)
    flushFrame()

    expect(ControlledIntersectionObserver.instances).toHaveLength(1)
    const observer = ControlledIntersectionObserver.instances[0]
    expect(observer.observed).toHaveLength(2)

    const scene = getByTestId('scene')
    const layer = getByTestId('layer')
    act(() => observer.emit(scene, true))
    flushFrame()

    expect(scene).toHaveAttribute('data-motion-entered')
    expect(scene).toHaveAttribute('data-copy-revealed')
    expect(scene).toHaveAttribute('data-parallax-active')
    expect(layer.style.translate).not.toBe('')

    act(() => observer.emit(scene, false))
    expect(scene).toHaveAttribute('data-motion-state', 'sleeping')
    expect(scene).not.toHaveAttribute('data-parallax-active')
    expect(layer.style.translate).toBe('')
    expect(scene).toHaveAttribute('data-copy-revealed')

    unmount()
    expect(observer.disconnected).toBe(true)
  })

  it('hides the nav below the hero while moving down and restores it moving up', () => {
    const { container } = render(<Harness />)
    flushFrame()
    const nav = container.querySelector('[data-motion-nav]')!

    scrollY = 700
    act(() => window.dispatchEvent(new Event('scroll')))
    flushFrame()
    expect(nav).toHaveAttribute('data-hidden')

    scrollY = 620
    act(() => window.dispatchEvent(new Event('scroll')))
    flushFrame()
    expect(nav).not.toHaveAttribute('data-hidden')
  })

  it('reveals immediately and disables parallax for reduced motion', () => {
    reducedMotion = true
    const { getByTestId } = render(<Harness />)
    const observer = ControlledIntersectionObserver.instances[0]
    const scene = getByTestId('scene')
    const layer = getByTestId('layer')

    act(() => observer.emit(scene, true))
    flushFrame()

    expect(scene).toHaveAttribute('data-copy-revealed')
    expect(scene).not.toHaveAttribute('data-parallax-active')
    expect(layer.style.translate).toBe('')
    expect(scene).toHaveAttribute('data-motion-state', 'active')
  })
})
