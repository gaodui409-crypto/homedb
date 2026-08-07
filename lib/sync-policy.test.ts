import { describe, expect, it } from 'vitest'

import { decideInitialSync, hasPendingSync, setPendingSync } from './sync-policy'

describe('initial cloud synchronization policy', () => {
  it('retries pending local changes instead of applying cloud data', () => {
    expect(decideInitialSync({ source: 'stored', hasPendingLocal: true }))
      .toBe('upload-local')
  })

  it('applies stored cloud data even when its groups array is empty', () => {
    expect(decideInitialSync({ source: 'stored', hasPendingLocal: false }))
      .toBe('use-cloud')
  })

  it('uploads local data when cloud storage is missing', () => {
    expect(decideInitialSync({ source: 'missing', hasPendingLocal: false }))
      .toBe('upload-local')
  })

  it('keeps local data when cloud storage is disabled', () => {
    expect(decideInitialSync({ source: 'disabled', hasPendingLocal: true }))
      .toBe('keep-local')
    expect(decideInitialSync({ source: 'disabled', hasPendingLocal: false }))
      .toBe('keep-local')
  })
})

describe('pending synchronization marker', () => {
  function createStorage() {
    const values = new Map<string, string>()
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    }
  }

  it('persists pending state across page lifetimes and clears it after success', () => {
    const storage = createStorage()

    setPendingSync(storage, true)
    expect(hasPendingSync(storage)).toBe(true)

    setPendingSync(storage, false)
    expect(hasPendingSync(storage)).toBe(false)
  })
})
