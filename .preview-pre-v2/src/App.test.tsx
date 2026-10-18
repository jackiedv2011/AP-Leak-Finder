import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '@/App'

function setLocation(path: string) {
  window.history.pushState({}, '', path)
}

describe('App routes', () => {
  it('opens the scanner upload screen from /scanner', async () => {
    setLocation('/scanner')

    render(<App />)

    expect(await screen.findByLabelText(/upload a csv ledger/i, undefined, { timeout: 5000 })).toBeInTheDocument()
  })
})
