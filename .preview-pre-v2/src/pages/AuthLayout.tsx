import type { ReactNode } from 'react'
import { ReclaimLogo } from '@/components/ReclaimLogo'
import '@/styles/theme.css'
import '@/pages/auth.css'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="reclaim-theme auth-page">
      <header className="auth-page-header">
        <a href="/" aria-label="Reclaim home"><ReclaimLogo size={26} /></a>
      </header>
      {children}
    </div>
  )
}
