'use client'

// Navigation store - updated 2026-03-19

import { useState, useEffect, useCallback, useRef } from 'react'

import { v4 as uuid } from 'uuid'

import type { Group, Bookmark, Theme, NavData, BackgroundSetting } from './types'
import { DEFAULT_DATA } from './default-data'
import { importNavDataSchema, navDataSchema, type ImportNavData } from './nav-schema'

const STORAGE_KEY = 'mininav_data'
const THEME_KEY = 'mininav_theme'
const TITLE_KEY = 'mininav_title'
const TOKEN_KEY = 'mininav_token'
const BG_KEY = 'mininav_bg'

function loadBackground(): BackgroundSetting {
  try {
    const raw = localStorage.getItem(BG_KEY)
    if (!raw) return { type: 'none' }
    const parsed = JSON.parse(raw) as BackgroundSetting
    if (parsed.type === 'color' || parsed.type === 'image' || parsed.type === 'none') {
      return parsed
    }
    return { type: 'none' }
  } catch {
    return { type: 'none' }
  }
}

function loadGroups(): Group[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DATA
    const parsed = navDataSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data.groups : DEFAULT_DATA
  } catch {
    return DEFAULT_DATA
  }
}

function saveGroupsLocal(groups: Group[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ groups }))
  } catch {}
}

function loadTheme(): Theme {
  return (localStorage.getItem(THEME_KEY) as Theme) ?? 'light'
}

function loadTitle(): string {
  return localStorage.getItem(TITLE_KEY) ?? '我的导航'
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function useNavStore() {
  const [groups, setGroupsState] = useState<Group[]>(() => loadGroups())
  const [theme, setThemeState] = useState<Theme>(() => loadTheme())
  const [title, setTitleState] = useState<string>(() => loadTitle())
  const [background, setBackgroundState] = useState<BackgroundSetting>(() => loadBackground())
  const [adminMode, setAdminMode] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingSyncRef = useRef<Group[] | null>(null)
  const syncInFlightRef = useRef(false)

  const clearSyncError = useCallback(() => setSyncError(null), [])

  const flushCloudSync = useCallback(async () => {
    if (syncInFlightRef.current) return

    syncInFlightRef.current = true
    setSyncing(true)

    try {
      while (pendingSyncRef.current) {
        const data = pendingSyncRef.current
        pendingSyncRef.current = null

        try {
          setSyncError(null)
          const token = getToken()
          const res = await fetch('/api/data', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ groups: data }),
          })
          const result = await res.json()
          if (!res.ok || !result.success) {
            throw new Error(result.error || 'Cloud sync failed')
          }
        } catch {
          if (!pendingSyncRef.current) pendingSyncRef.current = data
          setSyncError('云端同步失败')
          break
        }
      }
    } finally {
      syncInFlightRef.current = false
      setSyncing(false)
    }
  }, [])

  const syncToCloud = useCallback((data: Group[], immediate = false) => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
    }

    const queueSync = () => {
      pendingSyncRef.current = data
      void flushCloudSync()
    }

    if (immediate) {
      queueSync()
    } else {
      syncTimeoutRef.current = setTimeout(queueSync, 500)
    }
  }, [flushCloudSync])

  useEffect(() => {
    async function loadFromCloud() {
      try {
        const token = getToken()
        const res = await fetch('/api/data', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) {
          throw new Error('Cloud data request failed')
        }

        const cloudData = await res.json()
        const parsed = navDataSchema.safeParse(cloudData)
        if (!parsed.success) {
          throw new Error('Invalid cloud data')
        }

        const localData = loadGroups()
        const isLocalDefault =
          localData.length === DEFAULT_DATA.length &&
          localData.every((group) => group.id.startsWith('default-'))

        if (!cloudData.initialized && !isLocalDefault) {
          syncToCloud(localData)
        } else if (cloudData.initialized) {
          setGroupsState(parsed.data.groups)
          saveGroupsLocal(parsed.data.groups)
        }
      } catch {
        setSyncError('云端数据读取失败，当前使用本地数据')
      }
    }
    loadFromCloud()
  }, [syncToCloud])

  useEffect(() => () => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
  }, [])

  const setGroups = useCallback(
    (g: Group[] | ((prev: Group[]) => Group[])) => {
      setGroupsState((prev) => {
        const next = typeof g === 'function' ? g(prev) : g
        saveGroupsLocal(next)
        syncToCloud(next)
        return next
      })
    },
    [syncToCloud]
  )

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    localStorage.setItem(THEME_KEY, t)
  }, [])

  const setTitle = useCallback((t: string) => {
    setTitleState(t)
    localStorage.setItem(TITLE_KEY, t)
  }, [])

  const setBackground = useCallback((bg: BackgroundSetting) => {
    setBackgroundState(bg)
    localStorage.setItem(BG_KEY, JSON.stringify(bg))
  }, [])

  useEffect(() => {
    const html = document.documentElement
    html.classList.remove('theme-sepia', 'theme-dark')
    if (theme === 'sepia') html.classList.add('theme-sepia')
    if (theme === 'dark') html.classList.add('theme-dark')
  }, [theme])

  const addGroup = useCallback(
    (name: string, color: string) => {
      setGroups((prev) => [
        ...prev,
        { id: uuid(), name, order: prev.length, color, bookmarks: [] },
      ])
    },
    [setGroups]
  )

  const updateGroup = useCallback(
    (id: string, name: string, color: string) => {
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name, color } : g)))
    },
    [setGroups]
  )

  const deleteGroup = useCallback(
    (id: string) => {
      setGroups((prev) => prev.filter((g) => g.id !== id))
    },
    [setGroups]
  )

  const reorderGroups = useCallback(
    (newOrder: Group[]) => {
      const reordered = newOrder.map((g, i) => ({ ...g, order: i }))
      setGroups(reordered)
    },
    [setGroups]
  )

  const addBookmark = useCallback(
    (groupId: string, name: string, url: string, icon?: string, note?: string) => {
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g
          const bm: Bookmark = {
            id: uuid(),
            name,
            url,
            order: g.bookmarks.length,
            icon: icon || undefined,
            note: note?.trim() || undefined,
          }
          return { ...g, bookmarks: [...g.bookmarks, bm] }
        })
      )
    },
    [setGroups]
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
      const noteVal = note?.trim() || undefined
      setGroups((prev) => {
        if (!newGroupId || newGroupId === groupId) {
          return prev.map((g) => {
            if (g.id !== groupId) return g
            return {
              ...g,
              bookmarks: g.bookmarks.map((b) =>
                b.id === bookmarkId
                  ? { ...b, name, url, icon: icon || undefined, note: noteVal }
                  : b
              ),
            }
          })
        }
        let movedBm: Bookmark | null = null
        const updated = prev.map((g) => {
          if (g.id === groupId) {
            const bm = g.bookmarks.find((b) => b.id === bookmarkId)
            if (bm) movedBm = { ...bm, name, url, icon: icon || undefined, note: noteVal }
            return { ...g, bookmarks: g.bookmarks.filter((b) => b.id !== bookmarkId) }
          }
          return g
        })
        if (!movedBm) return prev
        return updated.map((g) => {
          if (g.id !== newGroupId) return g
          return {
            ...g,
            bookmarks: [...g.bookmarks, { ...movedBm!, order: g.bookmarks.length }],
          }
        })
      })
    },
    [setGroups]
  )

  const deleteBookmark = useCallback(
    (groupId: string, bookmarkId: string) => {
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g
          return { ...g, bookmarks: g.bookmarks.filter((b) => b.id !== bookmarkId) }
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
          return { ...g, bookmarks: newOrder.map((b, i) => ({ ...b, order: i })) }
        })
      )
    },
    [setGroups]
  )

  const moveBookmark = useCallback(
    (fromGroupId: string, toGroupId: string, bookmarkId: string, toIndex: number) => {
      setGroups((prev) => {
        let movedBm: Bookmark | null = null
        const step1 = prev.map((g) => {
          if (g.id !== fromGroupId) return g
          movedBm = g.bookmarks.find((b) => b.id === bookmarkId) ?? null
          return { ...g, bookmarks: g.bookmarks.filter((b) => b.id !== bookmarkId) }
        })
        if (!movedBm) return prev
        return step1.map((g) => {
          if (g.id !== toGroupId) return g
          const sorted = [...g.bookmarks].sort((a, b) => a.order - b.order)
          sorted.splice(toIndex, 0, movedBm!)
          return { ...g, bookmarks: sorted.map((b, i) => ({ ...b, order: i })) }
        })
      })
    },
    [setGroups]
  )

  const recordClick = useCallback(
    (bookmarkId: string) => {
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          bookmarks: g.bookmarks.map((b) =>
            b.id === bookmarkId ? { ...b, clicks: (b.clicks ?? 0) + 1 } : b
          ),
        }))
      )
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
    const data: NavData = { groups }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mininav-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [groups])

  const normalizeImportData = useCallback((data: ImportNavData): Group[] => {
    const defaultColors = [
      '#3B82F6',
      '#10B981',
      '#F59E0B',
      '#EF4444',
      '#8B5CF6',
      '#EC4899',
      '#06B6D4',
      '#84CC16',
    ]

    return data.groups.map((g, gIndex) => {
      const groupId = g.id || uuid()
      const groupColor = g.color || defaultColors[gIndex % defaultColors.length]

      const normalizedBookmarks: Bookmark[] = (g.bookmarks ?? []).map((b, bIndex) => ({
        id: b.id || uuid(),
        name: b.name,
        url: b.url,
        order: typeof b.order === 'number' ? b.order : bIndex,
        pinned: b.pinned ?? false,
        icon: b.icon || undefined,
        note: b.note || undefined,
        clicks: typeof b.clicks === 'number' ? b.clicks : undefined,
      }))

      return {
        id: groupId,
        name: g.name,
        order: typeof g.order === 'number' ? g.order : gIndex,
        color: groupColor,
        bookmarks: normalizedBookmarks,
        collapsed: g.collapsed ?? false,
      }
    })
  }, [])

  const importData = useCallback(
    (data: ImportNavData, mode: 'overwrite' | 'merge') => {
      const parsed = importNavDataSchema.parse(data)
      const normalizedGroups = normalizeImportData(parsed)

      if (mode === 'overwrite') {
        setGroups(normalizedGroups)
      } else {
        setGroups((prev) => {
          const merged = [...prev]
          for (const incoming of normalizedGroups) {
            const existing = merged.find((g) => g.id === incoming.id)
            if (existing) {
              const idx = merged.indexOf(existing)
              merged[idx] = {
                ...existing,
                bookmarks: [
                  ...existing.bookmarks,
                  ...incoming.bookmarks.filter(
                    (b) => !existing.bookmarks.find((eb) => eb.id === b.id)
                  ),
                ],
              }
            } else {
              merged.push(incoming)
            }
          }
          return merged
        })
      }
    },
    [setGroups, normalizeImportData]
  )

  return {
    groups,
    theme,
    title,
    background,
    adminMode,
    syncing,
    syncError,
    clearSyncError,
    retrySyncToCloud: () => syncToCloud(groups, true),
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
