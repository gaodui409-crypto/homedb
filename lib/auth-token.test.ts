import { describe, expect, it } from 'vitest'

import { createToken, isAuthorizationValid, safeCompare, verifyToken } from './auth-token'

const SECRET = 'review-secret'
const NOW = 1_800_000_000_000

describe('auth tokens', () => {
  it('compares passwords without depending on their byte length', () => {
    expect(safeCompare('secret', 'secret')).toBe(true)
    expect(safeCompare('secret', 'different-length-secret')).toBe(false)
  })

  it('accepts a valid token within its lifetime', () => {
    const token = createToken(SECRET, NOW)

    expect(verifyToken(token, SECRET, NOW + 1_000)).toBe(true)
  })

  it('rejects malformed tokens without throwing', () => {
    expect(() => verifyToken('0.x', SECRET, NOW)).not.toThrow()
    expect(verifyToken('0.x', SECRET, NOW)).toBe(false)
  })

  it('rejects expired and future-dated tokens', () => {
    const expired = createToken(SECRET, NOW - 31 * 24 * 60 * 60 * 1_000)
    const future = createToken(SECRET, NOW + 1_000)

    expect(verifyToken(expired, SECRET, NOW)).toBe(false)
    expect(verifyToken(future, SECRET, NOW)).toBe(false)
  })

  it('requires an exact bearer authorization header when a password is configured', () => {
    const token = createToken(SECRET, NOW)

    expect(isAuthorizationValid(`Bearer ${token}`, SECRET, NOW)).toBe(true)
    expect(isAuthorizationValid(token, SECRET, NOW)).toBe(false)
    expect(isAuthorizationValid(`Basic ${token}`, SECRET, NOW)).toBe(false)
    expect(isAuthorizationValid(null, SECRET, NOW)).toBe(false)
    expect(isAuthorizationValid(null, undefined, NOW)).toBe(true)
  })
})
