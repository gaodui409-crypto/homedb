import { describe, expect, it, vi } from 'vitest'

import {
  SIDEBAR_COLLAPSED_KEY,
  buildSidebarItems,
  normalizeSearchQuery,
  readSidebarCollapsed,
  resolveActiveGroupId,
  selectClosestVisibleGroup,
  writeSidebarCollapsed,
} from './sidebar-navigation'
import type { Group } from './types'

const groups: Group[] = [
  {
    id: 'vps',
    name: 'VPS',
    color: '#3B82F6',
    order: 0,
    bookmarks: [
      { id: 'v1', name: 'VPS 01', url: 'https://v1.example.com', order: 0 },
      { id: 'v2', name: 'VPS 02', url: 'https://v2.example.com', order: 1 },
    ],
  },
  {
    id: 'docs',
    name: '资料',
    color: '#10B981',
    order: 1,
    bookmarks: [],
  },
]

describe('sidebar navigation', () => {
  it('builds complete items in input order when the query is empty', () => {
    expect(buildSidebarItems(groups, '')).toEqual([
      {
        id: 'vps',
        name: 'VPS',
        color: '#3B82F6',
        count: 2,
        disabled: false,
      },
      {
        id: 'docs',
        name: '资料',
        color: '#10B981',
        count: 0,
        disabled: false,
      },
    ])
  })

  it('counts case-insensitive bookmark name and URL matches', () => {
    expect(buildSidebarItems(groups, '02')).toMatchObject([
      { id: 'vps', count: 1, disabled: false },
      { id: 'docs', count: 0, disabled: true },
    ])
    expect(buildSidebarItems(groups, 'V1.EXAMPLE')).toMatchObject([
      { id: 'vps', count: 1, disabled: false },
      { id: 'docs', count: 0, disabled: true },
    ])
  })

  it('matches bookmark names case-insensitively', () => {
    expect(buildSidebarItems(groups, 'vPs')).toMatchObject([
      { id: 'vps', count: 2, disabled: false },
      { id: 'docs', count: 0, disabled: true },
    ])
  })

  it('trims surrounding whitespace before matching', () => {
    expect(buildSidebarItems(groups, ' 02 ')).toMatchObject([
      { id: 'vps', count: 1, disabled: false },
      { id: 'docs', count: 0, disabled: true },
    ])
  })

  it('keeps the current active group or falls back to the first group', () => {
    expect(resolveActiveGroupId(['vps', 'docs'], 'docs')).toBe('docs')
    expect(resolveActiveGroupId(['vps', 'docs'], 'missing')).toBe('vps')
    expect(resolveActiveGroupId([], 'missing')).toBeNull()
  })

  it('selects the intersecting group closest to the sticky header', () => {
    expect(selectClosestVisibleGroup([
      { id: 'vps', top: -180, isIntersecting: true },
      { id: 'docs', top: 118, isIntersecting: true },
    ], 112)).toBe('docs')
    expect(selectClosestVisibleGroup([], 112)).toBeNull()
  })

  it('ignores non-intersecting groups when selecting the closest group', () => {
    expect(selectClosestVisibleGroup([
      { id: 'vps', top: 112, isIntersecting: false },
      { id: 'docs', top: 140, isIntersecting: true },
    ], 112)).toBe('docs')
  })

  it('normalizes shared search queries', () => {
    expect(normalizeSearchQuery(' VpS ')).toBe('vps')
  })
})

describe('sidebar collapsed preference', () => {
  it('reads only the persisted collapsed marker', () => {
    expect(readSidebarCollapsed({ getItem: () => '1' })).toBe(true)
    expect(readSidebarCollapsed({ getItem: () => null })).toBe(false)
  })

  it('rejects invalid persisted markers', () => {
    expect(readSidebarCollapsed({ getItem: () => 'true' })).toBe(false)
    expect(readSidebarCollapsed({ getItem: () => '0' })).toBe(false)
  })

  it('defaults to expanded when storage throws', () => {
    expect(readSidebarCollapsed({
      getItem: () => {
        throw new Error('storage unavailable')
      },
    })).toBe(false)
  })

  it('stores collapsed state without removing the preference', () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }

    writeSidebarCollapsed(storage, true)
    expect(storage.setItem).toHaveBeenCalledWith(SIDEBAR_COLLAPSED_KEY, '1')
    expect(storage.removeItem).not.toHaveBeenCalled()
  })

  it('removes expanded state without storing a marker', () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }

    writeSidebarCollapsed(storage, false)
    expect(storage.removeItem).toHaveBeenCalledWith(SIDEBAR_COLLAPSED_KEY)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('does not propagate storage write errors', () => {
    const storage = {
      setItem: () => {
        throw new Error('storage unavailable')
      },
      removeItem: () => {
        throw new Error('storage unavailable')
      },
    }

    expect(() => writeSidebarCollapsed(storage, true)).not.toThrow()
    expect(() => writeSidebarCollapsed(storage, false)).not.toThrow()
  })
})
