import { describe, expect, it } from 'vitest'
import { DEFAULT_DATA } from './default-data'
import {
  importNavDataSchema,
  navDataSchema,
  normalizeHttpUrl,
} from './nav-schema'

describe('normalizeHttpUrl', () => {
  it('adds HTTPS to a hostname', () => {
    expect(normalizeHttpUrl('example.com')).toBe('https://example.com/')
  })

  it('rejects non-HTTP schemes', () => {
    expect(normalizeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeHttpUrl('data:text/html,test')).toBeNull()
    expect(normalizeHttpUrl('ftp://example.com')).toBeNull()
  })
})

describe('navigation schemas', () => {
  it('accepts stored default data', () => {
    expect(navDataSchema.safeParse({ groups: DEFAULT_DATA }).success).toBe(true)
  })

  it('accepts the documented minimal import format', () => {
    const result = importNavDataSchema.safeParse({
      groups: [{
        name: '常用',
        bookmarks: [{ name: 'Example', url: 'https://example.com' }],
      }],
    })

    expect(result.success).toBe(true)
  })

  it('rejects unsafe bookmark URLs', () => {
    const result = importNavDataSchema.safeParse({
      groups: [{
        name: '常用',
        bookmarks: [{ name: 'Unsafe', url: 'javascript:alert(1)' }],
      }],
    })

    expect(result.success).toBe(false)
  })
})
