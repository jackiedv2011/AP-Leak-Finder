import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// Server tests run in the node environment, where there is no window to patch.
const hasWindow = typeof window !== 'undefined'

if (hasWindow) Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true })

if (hasWindow && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

if (hasWindow && !('IntersectionObserver' in window)) {
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  // @ts-expect-error jsdom has no IntersectionObserver
  window.IntersectionObserver = MockIntersectionObserver
}

if (hasWindow && !navigator.clipboard) {
  Object.assign(navigator, {
    clipboard: {
      writeText: () => Promise.resolve(),
    },
  })
}
