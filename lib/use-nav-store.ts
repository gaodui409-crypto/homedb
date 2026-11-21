'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { v4 as uuid } from 'uuid'
import type { Group, Bookmark, Theme, NavData, BackgroundSetting } from './types'
import {
  MAX_BOOKMARKS_PER_GROUP,
  MAX_CLICKS,
  MAX_GROUPS,
  importNavDataSchema,
  mergeNavGroups,
  normalizeImportData,
  salvageNavData,
  type ImportNavData,
} from './nav-schema'
import {
  clearToken,
  getBrowserStorage,
  getToken,
  loadBackground,
  loadStoredGroups,
  loadTheme,
  loadTitle,
  saveBackground,
  saveGroupsLocal,
  saveTheme,
  saveTitle,
  setToken,
} from './storage'
import {
  decideInitialSync,
  hasPendingSync,
  setPendingSync,
  type CloudDataSource,
} from './sync-policy'

export { getToken, setToken, clearToken }

export type SyncMode = 'checking' | 'cloud' | 'local'

export interface SyncNotice {
  message: string
  retryable: boolean
}

function sortGroupsByOrder(groups: Group[]): Group[] {
  return [...groups].sort((a, b) => a.order - b.order)
}

function sortBookmarksByOrder(bookmarks: Bookmark[]): Bookmark[] {
  return [...bookmarks].sort((a, b) => a.order - b.order)
}

function reindexGroups(groups: Group[]): Group[] {
  return groups.map((group, index) => ({ ...group, order: index }))
}

function reindexBookmarks(bookmarks: Bookmark[]): Bookmark[] {
  return bookmarks.map((bookmark, index) => ({ ...bookmark, order: index }))
}

export function useNavStore() {
  const [initialGroupsState] = useState(() => loadStoredGroups())
  const [groups, setGroupsState] = useState<Group[]>(initialGroupsState.groups)
  const [theme, setThemeState] = useState<Theme>(() => loadTheme())
  const [title, setTitleState] = useState<string>(() => loadTitle())
  const [background, setBackgroundState] = useState<BackgroundSetting>(() => loadBackground())
  const [adminMode, setAdminMode] = useState(false)
  const [syncMode, setSyncMode] = useState<SyncMode>('checking')
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncNotice, setSyncNotice] = useState<SyncNotice | null>(null)

  const groupsRef = useRef<Group[]>(initialGroupsState.groups)
  const localStatusRef = useRef(initialGroupsState.status)
  const hasUserMutatedRef = useRef(false)
  const initialCloudResolvedRef = useRef(false)
  const syncModeRef = useRef<SyncMode>('checking')
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncVersionRef = useRef(0)
  const activeSyncCountRef = useRef(0)
  const writeChainRef = useRef<Promise<void>>(Promise.resolve())
  const unmountedRef = useRef(false)

  useEffect(() => {
    groupsRef.current = groups
  }, [groups])

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
        syncTimeoutRef.current = null
      }
    }
  }, [])

  const reportError = useCallback((message: string, retryable: boolean, markSyncError = true) => {
    if (unmountedRef.current) return
    if (markSyncError) {
      setSyncError(message)
    }
    setSyncNotice({ message, retryable })
  }, [])

  // Dismisses only the transient toast; persistent syncError remains until a sync succeeds!
  const clearSyncError = useCallback(() => {
    setSyncNotice(null)
  }, [])

  const syncToCloud = useCallback(
    (data: Group[], delay = 500) => {
      if (syncModeRef.current === 'local') {
        setPendingSync(getBrowserStorage(), false)
        return
      }

      // Never POST before initial cloud handshake completes, preventing DEFAULT_DATA from overwriting Blob
      if (!initialCloudResolvedRef.current) {
        setPendingSync(getBrowserStorage(), true)
        return
      }

      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
        syncTimeoutRef.current = null
      }

      const version = ++syncVersionRef.current
      setPendingSync(getBrowserStorage(), true)

      syncTimeoutRef.current = setTimeout(() => {
        syncTimeoutRef.current = null
        writeChainRef.current = writeChainRef.current.then(async () => {
          if (syncModeRef.current === 'local' || !initialCloudResolvedRef.current) {
            return
          }

          activeSyncCountRef.current += 1
          if (!unmountedRef.current) {
            setSyncing(true)
          }

          try {
            const token = getToken()
            const res = await fetch('/api/data', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ groups: data }),
            })

            if (res.status === 401) {
              clearToken()
              reportError('登录已过期，请刷新重登', false)
              return
            }

            const result = (await res.json()) as {
              success?: boolean
              local?: boolean
              error?: string
            }

            if (!res.ok || !result.success) {
              throw new Error(result.error || 'Cloud sync failed')
            }

            if (result.local) {
              syncModeRef.current = 'local'
              setPendingSync(getBrowserStorage(), false)
              if (!unmountedRef.current) {
                setSyncMode('local')
                setSyncError(null)
                setSyncNotice(null)
              }
              return
            }

            syncModeRef.current = 'cloud'
            if (!unmountedRef.current) {
              setSyncMode('cloud')
              setSyncError(null)
              setSyncNotice(null)
            }

            if (version === syncVersionRef.current) {
              setPendingSync(getBrowserStorage(), false)
            }
          } catch {
            reportError('云端同步失败', true)
          } finally {
            activeSyncCountRef.current = Math.max(0, activeSyncCountRef.current - 1)
            if (
              !unmountedRef.current &&
              activeSyncCountRef.current === 0 &&
              syncTimeoutRef.current === null
            ) {
              setSyncing(false)
            }
          }
        })
      }, delay)
    },
    [reportError]
  )

  const loadFromCloud = useCallback(async () => {
    try {
      const token = getToken()
      const res = await fetch('/api/data', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (res.status === 401) {
        clearToken()
        reportError('登录已过期，请刷新重登', false)
        return
      }

      if (!res.ok) {
        throw new Error('Cloud data request failed')
      }

      const source = res.headers.get('X-Nav-Data-Source') as CloudDataSource | null
      if (source !== 'stored' && source !== 'missing' && source !== 'disabled') {
        reportError('云端状态异常', true)
        return
      }

      const recovered = salvageNavData(await res.json())
      if (!recovered) {
        throw new Error('Invalid cloud data')
      }

      if (source === 'disabled') {
        initialCloudResolvedRef.current = true
        syncModeRef.current = 'local'
        setPendingSync(getBrowserStorage(), false)
        if (!unmountedRef.current) {
          setSyncMode('local')
          setSyncError(null)
          setSyncNotice(null)
          if (localStatusRef.current === 'corrupt' && !hasUserMutatedRef.current) {
            reportError('本地数据异常，已备份原数据', false, false)
          }
        }
        return
      }

      initialCloudResolvedRef.current = true
      syncModeRef.current = 'cloud'
      if (!unmountedRef.current) {
        setSyncMode('cloud')
        setSyncError(null)
        setSyncNotice(null)
      }

      const localCorrupt =
        !hasUserMutatedRef.current && localStatusRef.current === 'corrupt'
      const hasPendingLocal =
        hasUserMutatedRef.current ||
        (!localCorrupt &&
          localStatusRef.current !== 'missing' &&
          hasPendingSync(getBrowserStorage()))

      const action = decideInitialSync({
        source,
        hasPendingLocal,
        localCorrupt,
      })

      if (action === 'upload-local') {
        syncToCloud(groupsRef.current, 0)
      } else if (action === 'use-cloud') {
        localStatusRef.current = 'valid'
        groupsRef.current = recovered.groups
        saveGroupsLocal(recovered.groups)
        setPendingSync(getBrowserStorage(), false)
        if (!unmountedRef.current) {
          setGroupsState(recovered.groups)
          setSyncError(null)
          setSyncNotice(null)
        }
      } else {
        setPendingSync(getBrowserStorage(), false)
        if (localCorrupt) {
          reportError('本地数据异常，已备份原数据', false, false)
        }
      }
    } catch {
      reportError('云端连接失败，暂用本机数据', true)
    }
  }, [reportError, syncToCloud])

  useEffect(() => {
    queueMicrotask(() => {
      void loadFromCloud()
    })
  }, [loadFromCloud])

  const retrySyncToCloud = useCallback(() => {
    if (!initialCloudResolvedRef.current) {
      void loadFromCloud()
      return
    }
    if (syncModeRef.current === 'local') return
    syncToCloud(groupsRef.current, 0)
  }, [loadFromCloud, syncToCloud])

  const setGroups = useCallback(
    (updater: Group[] | ((prev: Group[]) => Group[])) => {
      const next = typeof updater === 'function' ? updater(groupsRef.current) : updater
      hasUserMutatedRef.current = true
      localStatusRef.current = 'valid'
      groupsRef.current = next
      setGroupsState(next)

      const savedLocally = saveGroupsLocal(next)
      if (!savedLocally) {
        reportError('浏览器存储已满，请先导出备份', false, false)
      }
      syncToCloud(next)
    },
    [reportError, syncToCloud]
  )

  const restoreGroups = useCallback(
    (snapshot: Group[]) => {
      setGroups(snapshot)
    },
    [setGroups]
  )

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme)
    saveTheme(nextTheme)
  }, [])

  const setTitle = useCallback((nextTitle: string) => {
    const trimmed = nextTitle.trim().slice(0, 30)
    if (!trimmed) return
    setTitleState(trimmed)
    saveTitle(trimmed)
  }, [])

  const setBackground = useCallback((bg: BackgroundSetting) => {
    setBackgroundState(bg)
    saveBackground(bg)
  }, [])

  useEffect(() => {
    const html = document.documentElement
    html.classList.remove('theme-sepia', 'theme-dark')
    if (theme === 'sepia') html.classList.add('theme-sepia')
    if (theme === 'dark') html.classList.add('theme-dark')
    html.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
  }, [theme])

  const addGroup = useCallback(
    (name: string, color: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      if (groupsRef.current.length >= MAX_GROUPS) {
        reportError(`分组最多 ${MAX_GROUPS} 个`, false, false)
        return
      }
      setGroups((prev) =>
        reindexGroups([
          ...sortGroupsByOrder(prev),
          { id: uuid(), name: trimmed, order: prev.length, color, bookmarks: [] },
        ])
      )
    },
    [reportError, setGroups]
  )

  const updateGroup = useCallback(
    (id: string, name: string, color: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      setGroups((prev) =>
        prev.map((g) => (g.id === id ? { ...g, name: trimmed, color } : g))
      )
    },
    [setGroups]
  )

  const deleteGroup = useCallback(
    (id: string) => {
      setGroups((prev) => reindexGroups(sortGroupsByOrder(prev).filter((g) => g.id !== id)))
    },
    [setGroups]
  )

  const reorderGroups = useCallback(
    (newOrder: Group[]) => {
      setGroups(reindexGroups(newOrder))
    },
    [setGroups]
  )

  const addBookmark = useCallback(
    (groupId: string, name: string, url: string, icon?: string, note?: string) => {
      const targetGroup = groupsRef.current.find((g) => g.id === groupId)
      if (targetGroup && targetGroup.bookmarks.length >= MAX_BOOKMARKS_PER_GROUP) {
        reportError(`单组书签最多 ${MAX_BOOKMARKS_PER_GROUP} 个`, false, false)
        return
      }
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g
          const sorted = sortBookmarksByOrder(g.bookmarks)
          const bm: Bookmark = {
            id: uuid(),
            name: name.trim(),
            url,
            order: sorted.length,
            icon: icon?.trim() || undefined,
            note: note?.trim() || undefined,
          }
          return { ...g, bookmarks: reindexBookmarks([...sorted, bm]) }
        })
      )
    },
    [reportError, setGroups]
  )

  const updateBookmark = useCallback(
    (
      groupId: string,
      bookmarkId: string,
      name: string,
      url: string,
      icon?: string,
      newGroupId?: string,
      note?: string
    ) => {
      const trimmedName = name.trim()
      const iconVal = icon?.trim() || undefined
      const noteVal = note?.trim() || undefined

      if (newGroupId && newGroupId !== groupId) {
        const destGroup = groupsRef.current.find((g) => g.id === newGroupId)
        if (destGroup && destGroup.bookmarks.length >= MAX_BOOKMARKS_PER_GROUP) {
          reportError(`目标分组书签已满 ${MAX_BOOKMARKS_PER_GROUP} 个`, false, false)
          return
        }
      }

      setGroups((prev) => {
        if (!newGroupId || newGroupId === groupId) {
          return prev.map((g) => {
            if (g.id !== groupId) return g
            return {
              ...g,
              bookmarks: g.bookmarks.map((b) =>
                b.id === bookmarkId
                  ? { ...b, name: trimmedName, url, icon: iconVal, note: noteVal }
                  : b
              ),
            }
          })
        }

        let movedBm: Bookmark | null = null
        const removed = prev.map((g) => {
          if (g.id !== groupId) return g
          const sorted = sortBookmarksByOrder(g.bookmarks)
          const bm = sorted.find((b) => b.id === bookmarkId)
          if (bm) {
            movedBm = { ...bm, name: trimmedName, url, icon: iconVal, note: noteVal }
          }
          return {
            ...g,
            bookmarks: reindexBookmarks(sorted.filter((b) => b.id !== bookmarkId)),
          }
        })

        if (!movedBm) return prev

        return removed.map((g) => {
          if (g.id !== newGroupId) return g
          const sorted = sortBookmarksByOrder(g.bookmarks)
          return {
            ...g,
            bookmarks: reindexBookmarks([
              ...sorted,
              { ...movedBm!, order: sorted.length },
            ]),
          }
        })
      })
    },
    [reportError, setGroups]
  )

  const deleteBookmark = useCallback(
    (groupId: string, bookmarkId: string) => {
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g
          return {
            ...g,
            bookmarks: reindexBookmarks(
              sortBookmarksByOrder(g.bookmarks).filter((b) => b.id !== bookmarkId)
            ),
          }
        })
      )
    },
    [setGroups]
  )

  const reorderBookmarks = useCallback(
    (groupId: string, newOrder: Bookmark[]) => {
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g
          return { ...g, bookmarks: reindexBookmarks(newOrder) }
        })
      )
    },
    [setGroups]
  )

  const moveBookmark = useCallback(
    (fromGroupId: string, toGroupId: string, bookmarkId: string, toIndex: number) => {
      if (fromGroupId !== toGroupId) {
        const destGroup = groupsRef.current.find((g) => g.id === toGroupId)
        if (destGroup && destGroup.bookmarks.length >= MAX_BOOKMARKS_PER_GROUP) {
          reportError(`目标分组书签已满 ${MAX_BOOKMARKS_PER_GROUP} 个`, false, false)
          return
        }
      }

      setGroups((prev) => {
        if (fromGroupId === toGroupId) {
          return prev.map((g) => {
            if (g.id !== fromGroupId) return g
            const sorted = sortBookmarksByOrder(g.bookmarks)
            const currentIndex = sorted.findIndex((b) => b.id === bookmarkId)
            if (currentIndex === -1) return g
            const [item] = sorted.splice(currentIndex, 1)
            const safeIndex = Math.max(0, Math.min(toIndex, sorted.length))
            sorted.splice(safeIndex, 0, item)
            return { ...g, bookmarks: reindexBookmarks(sorted) }
          })
        }

        let movedBm: Bookmark | null = null
        const step1 = prev.map((g) => {
          if (g.id !== fromGroupId) return g
          const sorted = sortBookmarksByOrder(g.bookmarks)
          movedBm = sorted.find((b) => b.id === bookmarkId) ?? null
          return {
            ...g,
            bookmarks: reindexBookmarks(sorted.filter((b) => b.id !== bookmarkId)),
          }
        })
        if (!movedBm) return prev

        return step1.map((g) => {
          if (g.id !== toGroupId) return g
          const sorted = sortBookmarksByOrder(g.bookmarks)
          const safeIndex = Math.max(0, Math.min(toIndex, sorted.length))
          sorted.splice(safeIndex, 0, movedBm!)
          return { ...g, bookmarks: reindexBookmarks(sorted) }
        })
      })
    },
    [reportError, setGroups]
  )

  const recordClick = useCallback(
    (bookmarkId: string) => {
      const increment = (list: Group[]) =>
        list.map((g) => ({
          ...g,
          bookmarks: g.bookmarks.map((b) =>
            b.id === bookmarkId
              ? { ...b, clicks: Math.min(MAX_CLICKS, (b.clicks ?? 0) + 1) }
              : b
          ),
        }))

      // On uninitialized/corrupt local fallback before cloud resolves, never promote DEFAULT_DATA to pending upload
      if (
        !initialCloudResolvedRef.current &&
        (localStatusRef.current === 'missing' || localStatusRef.current === 'corrupt')
      ) {
        const next = increment(groupsRef.current)
        groupsRef.current = next
        setGroupsState(next)
        return
      }

      setGroups(increment)
    },
    [setGroups]
  )

  const toggleGroupCollapsed = useCallback(
    (groupId: string) => {
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g))
      )
    },
    [setGroups]
  )

  const togglePinBookmark = useCallback(
    (groupId: string, bookmarkId: string) => {
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g
          return {
            ...g,
            bookmarks: g.bookmarks.map((b) =>
              b.id === bookmarkId ? { ...b, pinned: !b.pinned } : b
            ),
          }
        })
      )
    },
    [setGroups]
  )

  const exportData = useCallback(() => {
    const orderedGroups = sortGroupsByOrder(groupsRef.current).map((g, gIndex) => ({
      ...g,
      order: gIndex,
      bookmarks: sortBookmarksByOrder(g.bookmarks).map((b, bIndex) => ({
        ...b,
        order: bIndex,
      })),
    }))
    const data: NavData = { groups: orderedGroups }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mininav-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const importData = useCallback(
    (data: ImportNavData, mode: 'overwrite' | 'merge') => {
      const parsed = importNavDataSchema.parse(data)
      const normalizedGroups = normalizeImportData(parsed)

      if (mode === 'overwrite') {
        const ordered = reindexGroups(
          sortGroupsByOrder(normalizedGroups).map((g) => ({
            ...g,
            bookmarks: reindexBookmarks(sortBookmarksByOrder(g.bookmarks)),
          }))
        )
        setGroups(ordered)
      } else {
        setGroups((prev) => mergeNavGroups(prev, normalizedGroups))
      }
    },
    [setGroups]
  )

  return {
    groups,
    theme,
    title,
    background,
    adminMode,
    syncMode,
    syncing,
    syncError,
    syncNotice,
    clearSyncError,
    retrySyncToCloud,
    setGroups,
    restoreGroups,
    setTheme,
    setTitle,
    setBackground,
    setAdminMode,
    recordClick,
    toggleGroupCollapsed,
    addGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
    addBookmark,
    updateBookmark,
    deleteBookmark,
    reorderBookmarks,
    moveBookmark,
    togglePinBookmark,
    exportData,
    importData,
  }
}

export type NavStore = ReturnType<typeof useNavStore>
