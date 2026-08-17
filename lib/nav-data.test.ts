import { describe, expect, it } from 'vitest'

import { normalizeImportData, parseStoredNavData } from './nav-data'

describe('navigation data validation', () => {
  it('normalizes the documented minimal import format', () => {
    const ids = ['group-id', 'bookmark-id']
    const result = normalizeImportData(
      {
        groups: [
          {
            name: 'Tools',
            bookmarks: [{ name: 'Example', url: 'example.com' }],
          },
        ],
      },
      () => ids.shift() ?? 'unexpected-id'
    )

    expect(result).toEqual({
      groups: [
        {
          id: 'group-id',
          name: 'Tools',
          order: 0,
          color: '#3B82F6',
          bookmarks: [
            {
              id: 'bookmark-id',
              name: 'Example',
              url: 'https://example.com/',
              order: 0,
              pinned: false,
              icon: undefined,
            },
          ],
        },
      ],
    })
  })

  it('rejects non-http bookmark and icon protocols', () => {
    expect(() => normalizeImportData({
      groups: [{ name: 'Bad', bookmarks: [{ name: 'Script', url: 'javascript:alert(1)' }] }],
    })).toThrow()

    expect(() => normalizeImportData({
      groups: [{
        name: 'Bad icon',
        bookmarks: [{ name: 'Site', url: 'https://example.com', icon: 'data:image/svg+xml,test' }],
      }],
    })).toThrow()
  })

  it('migrates legacy builtin icons to the favicon fallback', () => {
    const result = normalizeImportData({
      groups: [{
        name: 'Servers',
        bookmarks: [{
          name: 'Legacy server',
          url: 'https://example.com',
          icon: 'builtin:server',
        }],
      }],
    }, () => 'generated-id')

    expect(result.groups[0].bookmarks[0].icon).toBeUndefined()
  })

  it('migrates legacy builtin icons in stored data', () => {
    const result = parseStoredNavData({
      groups: [{
        id: 'group-id',
        name: 'Servers',
        order: 0,
        color: '#3B82F6',
        bookmarks: [{
          id: 'bookmark-id',
          name: 'Legacy server',
          url: 'https://example.com/',
          order: 0,
          pinned: false,
          icon: 'builtin:server',
        }],
      }],
    })

    expect(result.groups[0].bookmarks[0].icon).toBeUndefined()
  })

  it('accepts an intentionally empty stored dataset', () => {
    expect(parseStoredNavData({ groups: [] })).toEqual({ groups: [] })
  })

  it('rejects malformed stored data instead of partially accepting it', () => {
    expect(() => parseStoredNavData({ groups: [{ name: 'missing fields' }] })).toThrow()
  })
})
