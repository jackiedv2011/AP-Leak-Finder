import { beforeEach, describe, expect, it } from 'vitest'
import { continueAsGuest, getSession, logOut, validateLogIn, validateSignUp } from '@/lib/auth/localAuthService'

describe('browser-side auth (guest session + validators)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('refuses to create an account until the terms are agreed to', () => {
    const fields = validateSignUp({ firstName: 'A', lastName: 'B', email: 'a@b.co', password: 'longenough', confirmPassword: 'longenough', company: 'C', acceptedTerms: false })
    expect(fields).toEqual({ acceptedTerms: 'You need to agree to the Terms of Service and Privacy Policy.' })
  })

  it('reports every invalid field at once rather than the first one it finds', () => {
    const fields = validateSignUp({ firstName: '', lastName: '', email: 'nope', password: 'short', confirmPassword: 'other', company: '', acceptedTerms: false })
    expect(Object.keys(fields).sort()).toEqual(['acceptedTerms', 'company', 'confirmPassword', 'email', 'firstName', 'lastName', 'password'])
    expect(validateLogIn({ email: 'bad', password: '' })).toEqual({ email: 'Enter a valid email address.', password: 'Enter your password.' })
  })

  it('a guest session lives in the tab only and carries no credentials', () => {
    const guest = continueAsGuest()
    expect(guest.isGuest).toBe(true)
    expect(getSession()?.id).toBe(guest.id)
    expect(Object.keys(window.localStorage)).toHaveLength(0)
    logOut()
    expect(getSession()).toBeNull()
  })

  it('wipes the retired browser-side account store on sight, so no old password hash lingers', () => {
    window.localStorage.setItem('reclaim.auth.users.v1', '[{"passwordHash":"deadbeef"}]')
    window.localStorage.setItem('reclaim.auth.session.v1', '{"userId":"u1"}')
    getSession()
    expect(window.localStorage.getItem('reclaim.auth.users.v1')).toBeNull()
    expect(window.localStorage.getItem('reclaim.auth.session.v1')).toBeNull()
  })
})
