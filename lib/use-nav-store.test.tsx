// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CORRUPT_BACKUP_KEY, STORAGE_KEY, TOKEN_KEY } from './storage'
import { PENDING_SYNC_KEY } from './sync-policy'
import { useNavStore } from './use-nav-store'
import type { Group } from './types'

const sampleGroups: Group[] = [
  {
    id: 'g-vps',
    name: 'VPS',
    order: 0,
    color: '#3B82F6',
    bookmarks: [
      { id: 'b-1', name: 'VPS 01', url: 'https://vps01.example.com', order: 0 },
      { id: 'b-2', name: 'VPS 02', url: 'https://vps02.example.com', order: 1 },
      { id: 'b-3', name: 'VPS 03', url: 'https://vps03.example.com', order: 2 },
    ],
  },
  {
    id: 'g-ai',
    name: 'AI',
    order: 1,
    color: '#10B981',
    bookmarks: [
      { id: 'b-ai-1', name: 'Claude', url: 'https://claude.ai', order: 0 },
    ],
  },
]

function jsonResponse(
  body: unknown,
  headers: Record<string, string> = {},
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('useNavStore', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ groups: sampleGroups }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('maintains manual order without auto-reordering on clicks or pins, and avoids order collisions after deletions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { groups: sampleGroups, initialized: false, storage: 'local' },
        { 'X-Nav-Data-Source': 'disabled' }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useNavStore())
    await waitFor(() => expect(result.current.syncMode).toBe('local'))

    act(() => {
      for (let i = 0; i < 5; i += 1) {
        result.current.recordClick('b-3')
      }
      result.current.togglePinBookmark('g-vps', 'b-3')
    })

    const vpsBookmarks = result.current.groups[0].bookmarks
    expect(vpsBookmarks.map((b) => b.id)).toEqual(['b-1', 'b-2', 'b-3'])
    expect(vpsBookmarks[2].clicks).toBe(5)
    expect(vpsBookmarks[2].pinned).toBe(true)

    act(() => {
      result.current.deleteBookmark('g-vps', 'b-1')
      result.current.addBookmark('g-vps', 'VPS 04', 'https://vps04.example.com', 'builtin:server', '备用机')
    })

    const afterAdd = result.current.groups[0].bookmarks
    expect(afterAdd.map((b) => ({ name: b.name, order: b.order }))).toEqual([
      { name: 'VPS 02', order: 0 },
      { name: 'VPS 03', order: 1 },
      { name: 'VPS 04', order: 2 },
    ])
    expect(afterAdd[2].icon).toBe('builtin:server')
    expect(afterAdd[2].note).toBe('备用机')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(PENDING_SYNC_KEY)).toBeNull()
  })

  it('moves bookmarks across groups, supports snapshot restore, and imports/exports compatible JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { groups: sampleGroups, initialized: false, storage: 'local' },
          { 'X-Nav-Data-Source': 'disabled' }
        )
      )
    )

    const { result } = renderHook(() => useNavStore())
    await waitFor(() => expect(result.current.syncMode).toBe('local'))

    const snapshot = structuredClone(result.current.groups)

    act(() => {
      result.current.moveBookmark('g-vps', 'g-ai', 'b-2', 0)
    })

    expect(result.current.groups[0].bookmarks.map((b) => ({ id: b.id, order: b.order }))).toEqual([
      { id: 'b-1', order: 0 },
      { id: 'b-3', order: 1 },
    ])
    expect(result.current.groups[1].bookmarks.map((b) => ({ id: b.id, order: b.order }))).toEqual([
      { id: 'b-2', order: 0 },
      { id: 'b-ai-1', order: 1 },
    ])

    act(() => {
      result.current.restoreGroups(snapshot)
    })
    expect(result.current.groups[0].bookmarks.map((b) => b.id)).toEqual(['b-1', 'b-2', 'b-3'])

    act(() => {
      result.current.importData(
        {
          groups: [
            {
              id: 'g-ai',
              name: 'AI',
              bookmarks: [
                { id: 'b-ai-1', name: 'Claude', url: 'https://claude.ai' },
                { id: 'b-ai-2', name: 'ChatGPT', url: 'https://chatgpt.com', icon: 'builtin:cloud' },
              ],
            },
          ],
        },
        'merge'
      )
    })

    expect(result.current.groups[1].bookmarks.map((b) => ({ id: b.id, order: b.order }))).toEqual([
      { id: 'b-ai-1', order: 0 },
      { id: 'b-ai-2', order: 1 },
    ])
  })

  it('restores from stored cloud when local storage is corrupt, clears pending flag, and does not overwrite cloud on remount', async () => {
    localStorage.setItem(STORAGE_KEY, '{corrupted-json')
    localStorage.setItem(PENDING_SYNC_KEY, '1')

    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          { groups: sampleGroups, initialized: true, storage: 'blob' },
          { 'X-Nav-Data-Source': 'stored' }
        )
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result, unmount } = renderHook(() => useNavStore())

    await waitFor(() => expect(result.current.syncMode).toBe('cloud'))
    expect(result.current.groups).toEqual(sampleGroups)
    expect(localStorage.getItem(CORRUPT_BACKUP_KEY)).toBe('{corrupted-json')
    expect(localStorage.getItem(PENDING_SYNC_KEY)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    unmount()

    // Second mount with newer cloud data must pull newer cloud data rather than uploading stale recovery
    const newerCloudGroups: Group[] = [
      ...sampleGroups,
      { id: 'g-new', name: 'New Device Group', order: 2, color: '#F59E0B', bookmarks: [] },
    ]
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse(
          { groups: newerCloudGroups, initialized: true, storage: 'blob' },
          { 'X-Nav-Data-Source': 'stored' }
        )
      )
    )

    const second = renderHook(() => useNavStore())
    await waitFor(() => expect(second.result.current.groups).toHaveLength(3))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never POSTs DEFAULT_DATA over cloud on a new device when initial GET fails or is slow during clicks/retries', async () => {
    localStorage.clear() // brand new device: status === 'missing'

    let resolveSecondGet!: (res: Response) => void
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'outage' }, {}, 503))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecondGet = resolve
          })
      )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useNavStore())
    await waitFor(() => expect(result.current.syncError).toBe('云端连接失败，暂用本机数据'))

    // Dismissing toast must NOT clear persistent syncError
    act(() => {
      result.current.clearSyncError()
    })
    expect(result.current.syncNotice).toBeNull()
    expect(result.current.syncError).toBe('云端连接失败，暂用本机数据')

    // User clicks a default card and clicks Retry -> must re-GET, NEVER POST DEFAULT_DATA!
    const defaultBookmarkId = result.current.groups[0]?.bookmarks[0]?.id
    act(() => {
      if (defaultBookmarkId) result.current.recordClick(defaultBookmarkId)
      result.current.retrySyncToCloud()
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[1]?.method ?? 'GET').toBe('GET')

    await act(async () => {
      resolveSecondGet(
        jsonResponse(
          { groups: sampleGroups, initialized: true, storage: 'blob' },
          { 'X-Nav-Data-Source': 'stored' }
        )
      )
    })

    await waitFor(() => expect(result.current.syncMode).toBe('cloud'))
    expect(result.current.syncError).toBeNull()
    expect(result.current.groups).toEqual(sampleGroups)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('clears stale auth token and reports session expiry on 401 response', async () => {
    localStorage.setItem(TOKEN_KEY, 'expired-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: '未授权' }, {}, 401))
    )

    const { result } = renderHook(() => useNavStore())
    await waitFor(() => expect(result.current.syncError).toBe('登录已过期，请刷新重登'))
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(result.current.syncNotice?.retryable).toBe(false)
  })

  it('keeps syncing true across chained cloud writes without premature reset', async () => {
    let resolveFirstPost!: (res: Response) => void
    let resolveSecondPost!: (res: Response) => void

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { groups: sampleGroups, initialized: true, storage: 'blob' },
          { 'X-Nav-Data-Source': 'stored' }
        )
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirstPost = resolve
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecondPost = resolve
          })
      )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useNavStore())
    await waitFor(() => expect(result.current.syncMode).toBe('cloud'))

    act(() => {
      result.current.retrySyncToCloud()
    })
    await waitFor(() => expect(result.current.syncing).toBe(true))

    act(() => {
      result.current.retrySyncToCloud()
    })

    await act(async () => {
      resolveFirstPost(jsonResponse({ success: true }))
      await Promise.resolve()
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(result.current.syncing).toBe(true)

    await act(async () => {
      resolveSecondPost(jsonResponse({ success: true }))
    })
    await waitFor(() => expect(result.current.syncing).toBe(false))
    expect(localStorage.getItem(PENDING_SYNC_KEY)).toBeNull()
  })
})
