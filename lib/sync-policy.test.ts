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

  it('never uploads fallback defaults over cloud data when local storage was corrupt', () => {
    expect(
      decideInitialSync({ source: 'stored', hasPendingLocal: true, localCorrupt: true })
    ).toBe('use-cloud')
    expect(
      decideInitialSync({ source: 'missing', hasPendingLocal: false, localCorrupt: true })
    ).toBe('keep-local')
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

    expect(setPendingSync(storage, true)).toBe(true)
    expect(hasPendingSync(storage)).toBe(true)

    expect(setPendingSync(storage, false)).toBe(true)
    expect(hasPendingSync(storage)).toBe(false)
  })

  it('does not throw when storage access is denied or throws QuotaExceededError', () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {
        throw new Error('SecurityError')
      },
    }

    expect(hasPendingSync(throwingStorage)).toBe(false)
    expect(setPendingSync(throwingStorage, true)).toBe(false)
    expect(hasPendingSync(null)).toBe(false)
  })
})
