import { describe, expect, it } from 'vitest'
import { DEFAULT_DATA } from './default-data'
import {
  importNavDataSchema,
  mergeNavGroups,
  navDataSchema,
  normalizeHttpUrl,
  normalizeImportData,
  salvageNavData,
} from './nav-schema'
import type { Group } from './types'

describe('normalizeHttpUrl', () => {
  it('adds HTTPS to a hostname', () => {
    expect(normalizeHttpUrl('example.com')).toBe('https://example.com/')
  })

  it('rejects empty strings and non-HTTP schemes', () => {
    expect(normalizeHttpUrl('   ')).toBeNull()
    expect(normalizeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeHttpUrl('data:text/html,test')).toBeNull()
    expect(normalizeHttpUrl('ftp://example.com')).toBeNull()
    expect(normalizeHttpUrl('https://')).toBeNull()
  })
})

describe('navigation schemas and import normalization', () => {
  it('accepts stored default data and intentionally empty datasets, while rejecting duplicate IDs', () => {
    expect(navDataSchema.safeParse({ groups: DEFAULT_DATA }).success).toBe(true)
    expect(navDataSchema.parse({ groups: [] })).toEqual({ groups: [] })

    expect(
      navDataSchema.safeParse({
        groups: [
          {
            id: 'g1',
            name: 'A',
            order: 0,
            color: '#3B82F6',
            bookmarks: [{ id: 'dup', name: 'X', url: 'https://x.example.com', order: 0 }],
          },
          {
            id: 'g2',
            name: 'B',
            order: 1,
            color: '#10B981',
            bookmarks: [{ id: 'dup', name: 'Y', url: 'https://y.example.com', order: 0 }],
          },
        ],
      }).success
    ).toBe(false)
  })

  it('accepts full mininav-export.json shape including builtin icons, collapsed, pinned, clicks, and notes', () => {
    const sampleExport = {
      groups: [
        {
          id: 'grp-vps',
          name: 'VPS',
          order: 0,
          color: '#3B82F6',
          collapsed: false,
          bookmarks: [
            {
              id: 'bm-vps-01',
              name: 'VPS 01',
              url: 'https://vps01.example.com:8443/panel',
              order: 0,
              pinned: true,
              clicks: 12,
              icon: 'builtin:server',
              note: '仅限办公网访问',
            },
            {
              id: 'bm-vps-02',
              name: 'VPS 02',
              url: 'http://10.0.0.2:9000',
              order: 1,
              pinned: false,
              clicks: 0,
              icon: '',
              note: '',
            },
          ],
        },
      ],
    }

    expect(navDataSchema.safeParse(sampleExport).success).toBe(true)
    const normalized = normalizeImportData(sampleExport)
    expect(normalized[0]).toEqual({
      id: 'grp-vps',
      name: 'VPS',
      order: 0,
      color: '#3B82F6',
      collapsed: false,
      bookmarks: [
        {
          id: 'bm-vps-01',
          name: 'VPS 01',
          url: 'https://vps01.example.com:8443/panel',
          order: 0,
          pinned: true,
          clicks: 12,
          icon: 'builtin:server',
          note: '仅限办公网访问',
        },
        {
          id: 'bm-vps-02',
          name: 'VPS 02',
          url: 'http://10.0.0.2:9000',
          order: 1,
          pinned: false,
          clicks: 0,
          icon: undefined,
          note: undefined,
        },
      ],
    })
  })

  it('normalizes the documented minimal import format and deduplicates colliding IDs', () => {
    const ids = ['gen-g-1', 'gen-b-1', 'gen-b-2']
    const normalized = normalizeImportData(
      {
        groups: [
          {
            name: '常用',
            bookmarks: [
              { id: 'dup-id', name: 'One', url: 'https://one.example.com' },
              { id: 'dup-id', name: 'Two', url: 'https://two.example.com' },
            ],
          },
        ],
      },
      () => ids.shift() ?? 'fallback-id'
    )

    expect(normalized).toEqual([
      {
        id: 'gen-g-1',
        name: '常用',
        order: 0,
        color: '#3B82F6',
        collapsed: false,
        bookmarks: [
          {
            id: 'dup-id',
            name: 'One',
            url: 'https://one.example.com',
            order: 0,
            pinned: false,
            icon: undefined,
            note: undefined,
            clicks: undefined,
          },
          {
            id: 'gen-b-1',
            name: 'Two',
            url: 'https://two.example.com',
            order: 1,
            pinned: false,
            icon: undefined,
            note: undefined,
            clicks: undefined,
          },
        ],
      },
    ])
  })

  it('rejects unsafe bookmark and icon protocols', () => {
    expect(
      importNavDataSchema.safeParse({
        groups: [{ name: '常用', bookmarks: [{ name: 'Unsafe', url: 'javascript:alert(1)' }] }],
      }).success
    ).toBe(false)

    expect(
      importNavDataSchema.safeParse({
        groups: [
          {
            name: '常用',
            bookmarks: [
              { name: 'BadIcon', url: 'https://example.com', icon: 'data:image/svg+xml,test' },
            ],
          },
        ],
      }).success
    ).toBe(false)
  })
})

describe('mergeNavGroups', () => {
  it('merges by group ID, preserves manual ordering, and re-indexes monotonic orders without collisions', () => {
    const existing: Group[] = [
      {
        id: 'g-1',
        name: '第一组',
        order: 5,
        color: '#3B82F6',
        bookmarks: [
          { id: 'b-1', name: 'A', url: 'https://a.example.com', order: 10 },
        ],
      },
    ]

    const incoming: Group[] = [
      {
        id: 'g-1',
        name: '第一组（新名不覆盖）',
        order: 0,
        color: '#EF4444',
        bookmarks: [
          { id: 'b-1', name: 'Duplicate A', url: 'https://a.example.com', order: 0 },
          { id: 'b-2', name: 'B', url: 'https://b.example.com', order: 0 },
        ],
      },
      {
        id: 'g-2',
        name: '新增组',
        order: 0,
        color: '#10B981',
        bookmarks: [
          { id: 'b-3', name: 'C', url: 'https://c.example.com', order: 3 },
        ],
      },
    ]

    const merged = mergeNavGroups(existing, incoming)
    expect(merged.map((g) => ({ id: g.id, name: g.name, order: g.order }))).toEqual([
      { id: 'g-1', name: '第一组', order: 0 },
      { id: 'g-2', name: '新增组', order: 1 },
    ])
    expect(merged[0].bookmarks.map((b) => ({ id: b.id, order: b.order }))).toEqual([
      { id: 'b-1', order: 0 },
      { id: 'b-2', order: 1 },
    ])
    expect(merged[1].bookmarks.map((b) => ({ id: b.id, order: b.order }))).toEqual([
      { id: 'b-3', order: 0 },
    ])
  })
})

describe('salvageNavData', () => {
  it('salvages valid groups and bookmarks when a single item has malformed fields or empty names', () => {
    const result = salvageNavData(
      {
        groups: [
          {
            id: 'g-keep',
            name: '', // empty group name should fall back rather than dropping valid bookmarks
            order: 0,
            color: '#fff', // invalid 3-hex color should fall back cleanly
            bookmarks: [
              {
                id: 'b-good',
                name: '', // empty bookmark name should fall back to domain
                url: 'https://www.github.com/trending',
                order: 0,
                icon: 'javascript:bad()', // invalid icon stripped without losing bookmark
                clicks: 8,
              },
              {
                id: 'b-bad-url',
                name: 'Broken',
                url: 'javascript:alert(1)', // unsafe bookmark skipped
                order: 1,
              },
            ],
          },
        ],
      },
      () => 'gen-id'
    )

    expect(result).not.toBeNull()
    expect(result?.salvaged).toBe(true)
    expect(result?.groups).toHaveLength(1)
    expect(result?.groups[0].name).toBe('未命名分组')
    expect(result?.groups[0].color).toBe('#3B82F6')
    expect(result?.groups[0].bookmarks).toEqual([
      {
        id: 'b-good',
        name: 'github.com',
        url: 'https://www.github.com/trending',
        order: 0,
        clicks: 8,
      },
    ])
  })

  it('returns null for completely unrecognizable payloads', () => {
    expect(salvageNavData('not-an-object')).toBeNull()
    expect(salvageNavData({ wrongKey: [] })).toBeNull()
    expect(salvageNavData({ groups: [{ broken: true }] })).toBeNull()
  })
})
