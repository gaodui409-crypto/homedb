'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { v4 as uuid } from 'uuid'
import type { Group, Bookmark, Theme, NavData, BackgroundSetting } from './types'
import {
  MAX_BACKUP_FILE_BYTES,
  MAX_BACKUP_FILE_MB,
  MAX_BOOKMARKS_PER_GROUP,
  MAX_CLICKS,
  MAX_GROUPS,
  bookmarkSchema,
  importNavDataSchema,
  mergeNavGroups,
  normalizeHttpUrl,
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
  CLOUD_MISSING_SENTINEL,
  decideInitialSync,
  getStoredCloudEtag,
  hasPendingSync,
  setPendingSync,
  setStoredCloudEtag,
  type CloudDataSource,
} from './sync-policy'

export { getToken, setToken, clearToken }

export type SyncMode = 'checking' | 'cloud' | 'local'

export interface SyncNotice {
  message: string
  retryable: boolean
}

type CloudBaseline =
  | { kind: 'unknown' }
  | { kind: 'missing' }
  | { kind: 'etag'; etag: string }
  | { kind: 'unversioned' }

const DATA_ETAG_HEADER = 'X-Nav-Data-Etag'
const MAX_CONFLICT_RETRIES = 3

function loadInitialCloudBaseline(): CloudBaseline {
  const stored = getStoredCloudEtag(getBrowserStorage())
  if (!stored) return { kind: 'unknown' }
  if (stored === CLOUD_MISSING_SENTINEL) return { kind: 'missing' }
  return { kind: 'etag', etag: stored }
}

function persistCloudBaseline(baseline: CloudBaseline): void {
  const storage = getBrowserStorage()
  if (baseline.kind === 'etag') {
    setStoredCloudEtag(storage, baseline.etag)
  } else if (baseline.kind === 'missing') {
    setStoredCloudEtag(storage, CLOUD_MISSING_SENTINEL)
  } else if (baseline.kind === 'unversioned') {
    setStoredCloudEtag(storage, null)
  }
}

function extractResponseEtag(res: Response, body?: { etag?: unknown } | null): string | null {
  const headerEtag = res.headers.get(DATA_ETAG_HEADER)?.trim()
  if (headerEtag) return headerEtag
  if (body && typeof body.etag === 'string' && body.etag.trim()) {
    return body.etag.trim()
  }
  return null
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

function applyClickDeltas(
  groups: Group[],
  deltas: ReadonlyMap<string, number>
): { groups: Group[]; applied: boolean } {
  if (deltas.size === 0) return { groups, applied: false }
  let applied = false
  const nextGroups = groups.map((group) => {
    let groupChanged = false
    const nextBookmarks = group.bookmarks.map((bookmark) => {
      const delta = deltas.get(bookmark.id)
      if (!delta) return bookmark
      const currentClicks = bookmark.clicks ?? 0
      const nextClicks = Math.min(MAX_CLICKS, currentClicks + delta)
      if (nextClicks === currentClicks) return bookmark
      applied = true
      groupChanged = true
      return { ...bookmark, clicks: nextClicks }
    })
    return groupChanged ? { ...group, bookmarks: nextBookmarks } : group
  })
  return { groups: applied ? nextGroups : groups, applied }
}

function applyCollapseOverrides(
  groups: Group[],
  overrides: ReadonlyMap<string, boolean>
): { groups: Group[]; applied: boolean } {
  if (overrides.size === 0) return { groups, applied: false }
  let applied = false
  const nextGroups = groups.map((group) => {
    if (!overrides.has(group.id)) return group
    const nextCollapsed = overrides.get(group.id)!
    if (Boolean(group.collapsed) === nextCollapsed) return group
    applied = true
    return { ...group, collapsed: nextCollapsed }
  })
  return { groups: applied ? nextGroups : groups, applied }
}

export function useNavStore() {
  const [initialGroupsState] = useState(() => loadStoredGroups())
  const [groups, setGroupsState] = useState<Group[]>(initialGroupsState.groups)
  const [theme, setThemeState] = useState<Theme>(() => loadTheme())
  const [title, setTitleState] = useState<string>(() => loadTitle())
  const [background, setBackgroundState] = useState<BackgroundSetting>(() => loadBackground())
  const [adminMode, setAdminModeState] = useState(false)
  const [syncMode, setSyncMode] = useState<SyncMode>('checking')
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncNotice, setSyncNotice] = useState<SyncNotice | null>(null)

  const groupsRef = useRef<Group[]>(initialGroupsState.groups)
  const localStatusRef = useRef(initialGroupsState.status)
  const hasUserMutatedRef = useRef(false)
  const initialCloudResolvedRef = useRef(false)
  const pendingClicksRef = useRef<Map<string, number>>(new Map())
  const pendingCollapseRef = useRef<Map<string, boolean>>(new Map())
  const uncommittedClicksRef = useRef<Map<string, number>>(new Map())
  const uncommittedCollapseRef = useRef<Map<string, boolean>>(new Map())
  const hasUncommittedStructuralEditRef = useRef<boolean>(
    initialGroupsState.status !== 'missing' &&
      initialGroupsState.status !== 'corrupt' &&
      hasPendingSync(getBrowserStorage())
  )
  const cloudBaselineRef = useRef<CloudBaseline>(loadInitialCloudBaseline())
  const adminModeRef = useRef(false)
  const syncErrorRef = useRef<string | null>(null)
  const syncModeRef = useRef<SyncMode>('checking')
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncVersionRef = useRef(0)
  const lastSyncedVersionRef = useRef(0)
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
      syncErrorRef.current = message
      setSyncError(message)
    }
    setSyncNotice({ message, retryable })
  }, [])

  const setAdminMode = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const target = typeof next === 'function' ? next(adminModeRef.current) : next
      if (target && !initialCloudResolvedRef.current && syncErrorRef.current === null) {
        reportError('正在连接云端，请稍后再编辑', false, false)
        return
      }
      adminModeRef.current = target
      setAdminModeState(target)
    },
    [reportError]
  )

  // Dismisses only the transient toast; persistent syncError remains until a sync succeeds
  const clearSyncError = useCallback(() => {
    setSyncNotice(null)
  }, [])

  const syncToCloud = useCallback(
    (_data: Group[], delay = 500) => {
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

      const scheduledVersion = ++syncVersionRef.current
      setPendingSync(getBrowserStorage(), true)

      const consumeSyncedDeltas = (
        sentClicks: ReadonlyMap<string, number>,
        sentCollapses: ReadonlyMap<string, boolean>
      ) => {
        for (const [bookmarkId, delta] of sentClicks) {
          const remaining = (uncommittedClicksRef.current.get(bookmarkId) ?? 0) - delta
          if (remaining > 0) {
            uncommittedClicksRef.current.set(bookmarkId, remaining)
          } else {
            uncommittedClicksRef.current.delete(bookmarkId)
          }
        }
        for (const [groupId, collapsedVal] of sentCollapses) {
          if (uncommittedCollapseRef.current.get(groupId) === collapsedVal) {
            uncommittedCollapseRef.current.delete(groupId)
          }
        }
      }

      const markLocalMode = () => {
        syncModeRef.current = 'local'
        syncErrorRef.current = null
        uncommittedClicksRef.current.clear()
        uncommittedCollapseRef.current.clear()
        hasUncommittedStructuralEditRef.current = false
        setStoredCloudEtag(getBrowserStorage(), null)
        setPendingSync(getBrowserStorage(), false)
        if (!unmountedRef.current) {
          setSyncMode('local')
          setSyncError(null)
          setSyncNotice(null)
        }
      }

      const markCloudClean = (completedVersion: number) => {
        lastSyncedVersionRef.current = Math.max(
          lastSyncedVersionRef.current,
          completedVersion
        )
        syncModeRef.current = 'cloud'
        syncErrorRef.current = null
        if (!unmountedRef.current) {
          setSyncMode('cloud')
          setSyncError(null)
          setSyncNotice(null)
        }
        if (completedVersion === syncVersionRef.current) {
          hasUncommittedStructuralEditRef.current = false
          setPendingSync(getBrowserStorage(), false)
        }
      }

      const buildConditionHeaders = (): Record<string, string> => {
        const baseline = cloudBaselineRef.current
        if (baseline.kind === 'etag') {
          return { 'If-Match': baseline.etag }
        }
        if (baseline.kind === 'missing') {
          return { 'If-None-Match': '*' }
        }
        return {}
      }

      const postGroups = async (payloadGroups: Group[]) => {
        const token = getToken()
        return fetch('/api/data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...buildConditionHeaders(),
          },
          body: JSON.stringify({ groups: payloadGroups }),
        })
      }

      syncTimeoutRef.current = setTimeout(() => {
        syncTimeoutRef.current = null
        writeChainRef.current = writeChainRef.current.then(async () => {
          if (syncModeRef.current === 'local' || !initialCloudResolvedRef.current) {
            return
          }
          if (lastSyncedVersionRef.current >= scheduledVersion) {
            return
          }

          activeSyncCountRef.current += 1
          if (!unmountedRef.current) {
            setSyncing(true)
          }

          try {
            const attemptVersion = syncVersionRef.current
            const sentClicks = new Map(uncommittedClicksRef.current)
            const sentCollapses = new Map(uncommittedCollapseRef.current)
            const res = await postGroups(groupsRef.current)

            if (res.status === 401) {
              clearToken()
              reportError('登录已过期，请刷新重登', false)
              return
            }

            if (res.status === 409 || res.status === 412) {
              if (hasUncommittedStructuralEditRef.current) {
                setPendingSync(getBrowserStorage(), false)
                reportError('云端已有新修改，请先导出备份再刷新', false)
                return
              }

              for (let retry = 0; retry < MAX_CONFLICT_RETRIES; retry += 1) {
                const token = getToken()
                const getRes = await fetch('/api/data', {
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                })

                if (getRes.status === 401) {
                  clearToken()
                  reportError('登录已过期，请刷新重登', false)
                  return
                }
                if (!getRes.ok) {
                  throw new Error('Failed to refresh cloud data')
                }

                const remoteSource = getRes.headers.get(
                  'X-Nav-Data-Source'
                ) as CloudDataSource | null
                if (remoteSource === 'disabled') {
                  markLocalMode()
                  return
                }
                if (remoteSource !== 'stored' && remoteSource !== 'missing') {
                  throw new Error('Invalid cloud source')
                }

                const rawRemote = (await getRes.json()) as { etag?: unknown }
                const recovered = salvageNavData(rawRemote)
                if (!recovered) {
                  throw new Error('Invalid cloud data')
                }

                const remoteEtag = extractResponseEtag(getRes, rawRemote)
                const nextBaseline: CloudBaseline =
                  remoteSource === 'missing'
                    ? { kind: 'missing' }
                    : remoteEtag
                      ? { kind: 'etag', etag: remoteEtag }
                      : { kind: 'unversioned' }
                cloudBaselineRef.current = nextBaseline
                persistCloudBaseline(nextBaseline)

                if (hasUncommittedStructuralEditRef.current) {
                  setPendingSync(getBrowserStorage(), false)
                  reportError('云端已有新修改，请先导出备份再刷新', false)
                  return
                }

                const mergeVersion = syncVersionRef.current
                const mergeClicks = new Map(uncommittedClicksRef.current)
                const mergeCollapses = new Map(uncommittedCollapseRef.current)
                const afterClicks = applyClickDeltas(recovered.groups, mergeClicks)
                const afterCollapses = applyCollapseOverrides(
                  afterClicks.groups,
                  mergeCollapses
                )
                const mergedGroups = afterCollapses.groups
                const applied = afterClicks.applied || afterCollapses.applied

                localStatusRef.current = 'valid'
                groupsRef.current = mergedGroups
                saveGroupsLocal(mergedGroups)
                if (!unmountedRef.current) {
                  setGroupsState(mergedGroups)
                }

                if (!applied) {
                  consumeSyncedDeltas(mergeClicks, mergeCollapses)
                  markCloudClean(mergeVersion)
                  return
                }

                const retryRes = await postGroups(mergedGroups)
                if (retryRes.status === 401) {
                  clearToken()
                  reportError('登录已过期，请刷新重登', false)
                  return
                }
                if (retryRes.status === 409 || retryRes.status === 412) {
                  continue
                }

                const retryResult = (await retryRes.json()) as {
                  success?: boolean
                  local?: boolean
                  error?: string
                  etag?: string
                }
                if (!retryRes.ok || !retryResult.success) {
                  throw new Error(retryResult.error || 'Cloud sync failed')
                }
                if (retryResult.local) {
                  markLocalMode()
                  return
                }

                const savedEtag = extractResponseEtag(retryRes, retryResult)
                if (savedEtag) {
                  const savedBaseline: CloudBaseline = { kind: 'etag', etag: savedEtag }
                  cloudBaselineRef.current = savedBaseline
                  persistCloudBaseline(savedBaseline)
                }
                consumeSyncedDeltas(mergeClicks, mergeCollapses)
                markCloudClean(mergeVersion)
                return
              }

              reportError('云端同步繁忙，请稍后重试', true)
              return
            }

            const result = (await res.json()) as {
              success?: boolean
              local?: boolean
              error?: string
              etag?: string
            }

            if (!res.ok || !result.success) {
              throw new Error(result.error || 'Cloud sync failed')
            }

            if (result.local) {
              markLocalMode()
              return
            }

            const nextEtag = extractResponseEtag(res, result)
            if (nextEtag) {
              const savedBaseline: CloudBaseline = { kind: 'etag', etag: nextEtag }
              cloudBaselineRef.current = savedBaseline
              persistCloudBaseline(savedBaseline)
            }
            consumeSyncedDeltas(sentClicks, sentCollapses)
            markCloudClean(attemptVersion)
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
        reportError('云端响应异常，请重试', true)
        return
      }

      const rawJson = (await res.json()) as { etag?: unknown }
      const recovered = salvageNavData(rawJson)
      if (!recovered) {
        throw new Error('Invalid cloud data')
      }

      if (source === 'disabled') {
        initialCloudResolvedRef.current = true
        syncModeRef.current = 'local'
        syncErrorRef.current = null
        const hadPendingViewActions =
          pendingClicksRef.current.size > 0 || pendingCollapseRef.current.size > 0
        pendingClicksRef.current.clear()
        pendingCollapseRef.current.clear()
        uncommittedClicksRef.current.clear()
        uncommittedCollapseRef.current.clear()
        hasUncommittedStructuralEditRef.current = false
        setStoredCloudEtag(getBrowserStorage(), null)
        if (hadPendingViewActions && localStatusRef.current !== 'corrupt') {
          localStatusRef.current = 'valid'
          saveGroupsLocal(groupsRef.current)
        }
        setPendingSync(getBrowserStorage(), false)
        if (!unmountedRef.current) {
          setSyncMode('local')
          setSyncError(null)
          setSyncNotice(null)
          if (localStatusRef.current === 'corrupt' && !hasUserMutatedRef.current) {
            reportError('本机数据异常，已自动备份', false, false)
          }
        }
        return
      }

      const remoteEtag = extractResponseEtag(res, rawJson)
      const remoteBaseline: CloudBaseline =
        source === 'missing'
          ? { kind: 'missing' }
          : remoteEtag
            ? { kind: 'etag', etag: remoteEtag }
            : { kind: 'unversioned' }

      initialCloudResolvedRef.current = true
      syncModeRef.current = 'cloud'
      syncErrorRef.current = null
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

      const bufferedClicks = new Map(pendingClicksRef.current)
      const bufferedCollapses = new Map(pendingCollapseRef.current)
      pendingClicksRef.current.clear()
      pendingCollapseRef.current.clear()

      if (action === 'upload-local') {
        if (source === 'missing') {
          cloudBaselineRef.current = { kind: 'missing' }
          persistCloudBaseline({ kind: 'missing' })
        } else if (cloudBaselineRef.current.kind === 'unknown') {
          cloudBaselineRef.current =
            remoteBaseline.kind === 'unversioned'
              ? { kind: 'unversioned' }
              : { kind: 'missing' }
        }
        for (const [bookmarkId, delta] of bufferedClicks) {
          uncommittedClicksRef.current.set(
            bookmarkId,
            (uncommittedClicksRef.current.get(bookmarkId) ?? 0) + delta
          )
        }
        for (const [groupId, collapsedVal] of bufferedCollapses) {
          uncommittedCollapseRef.current.set(groupId, collapsedVal)
        }
        syncToCloud(groupsRef.current, 0)
      } else if (action === 'use-cloud') {
        cloudBaselineRef.current = remoteBaseline
        persistCloudBaseline(remoteBaseline)
        hasUncommittedStructuralEditRef.current = false
        uncommittedClicksRef.current.clear()
        uncommittedCollapseRef.current.clear()

        const afterClicks = applyClickDeltas(recovered.groups, bufferedClicks)
        const afterCollapses = applyCollapseOverrides(
          afterClicks.groups,
          bufferedCollapses
        )
        const mergedGroups = afterCollapses.groups
        const applied = afterClicks.applied || afterCollapses.applied
        localStatusRef.current = 'valid'
        groupsRef.current = mergedGroups
        saveGroupsLocal(mergedGroups)
        if (!unmountedRef.current) {
          setGroupsState(mergedGroups)
          setSyncError(null)
          setSyncNotice(null)
        }
        if (applied) {
          for (const [bookmarkId, delta] of bufferedClicks) {
            uncommittedClicksRef.current.set(bookmarkId, delta)
          }
          for (const [groupId, collapsedVal] of bufferedCollapses) {
            uncommittedCollapseRef.current.set(groupId, collapsedVal)
          }
          syncToCloud(mergedGroups, 0)
        } else {
          setPendingSync(getBrowserStorage(), false)
        }
      } else {
        setPendingSync(getBrowserStorage(), false)
        if (localCorrupt) {
          reportError('本机数据异常，已自动备份', false, false)
        }
      }
    } catch {
      reportError('连不上云端，暂用本机数据', true)
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
      hasUncommittedStructuralEditRef.current = true
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

  const restoreBookmark = useCallback(
    (groupId: string, bookmark: Bookmark, index: number): boolean => {
      const current = groupsRef.current
      const alreadyExists = current.some((g) =>
        g.bookmarks.some((b) => b.id === bookmark.id)
      )
      const targetGroup = current.find((g) => g.id === groupId)
      if (
        alreadyExists ||
        !targetGroup ||
        targetGroup.bookmarks.length >= MAX_BOOKMARKS_PER_GROUP
      ) {
        reportError('没能恢复', false, false)
        return false
      }

      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g
          const sorted = sortBookmarksByOrder(g.bookmarks)
          const safeIndex = Math.max(0, Math.min(index, sorted.length))
          sorted.splice(safeIndex, 0, bookmark)
          return { ...g, bookmarks: reindexBookmarks(sorted) }
        })
      )
      return true
    },
    [reportError, setGroups]
  )

  const restoreGroup = useCallback(
    (group: Group, index: number): boolean => {
      const current = groupsRef.current
      if (current.length >= MAX_GROUPS || current.some((g) => g.id === group.id)) {
        reportError('没能恢复', false, false)
        return false
      }

      setGroups((prev) => {
        if (prev.length >= MAX_GROUPS || prev.some((g) => g.id === group.id)) {
          return prev
        }

        const existingBookmarkIds = new Set<string>()
        for (const g of prev) {
          for (const b of g.bookmarks) existingBookmarkIds.add(b.id)
        }

        const safeBookmarks = reindexBookmarks(
          sortBookmarksByOrder(group.bookmarks).filter(
            (b) => !existingBookmarkIds.has(b.id)
          )
        )

        const sorted = sortGroupsByOrder(prev)
        const safeIndex = Math.max(0, Math.min(index, sorted.length))
        sorted.splice(safeIndex, 0, { ...group, bookmarks: safeBookmarks })
        return reindexGroups(sorted)
      })
      return true
    },
    [reportError, setGroups]
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
      const trimmedUrl = url.trim()
      const finalUrl = /^https?:\/\//i.test(trimmedUrl)
        ? trimmedUrl
        : (normalizeHttpUrl(trimmedUrl) ?? trimmedUrl)
      const rawIcon = icon?.trim() || undefined
      const finalIcon =
        !rawIcon || rawIcon.startsWith('builtin:')
          ? rawIcon
          : /^https?:\/\//i.test(rawIcon)
            ? rawIcon
            : (normalizeHttpUrl(rawIcon) ?? rawIcon)
      const candidate: Bookmark = {
        id: uuid(),
        name: name.trim(),
        url: finalUrl,
        order: 0,
        icon: finalIcon,
        note: note?.trim() || undefined,
      }
      if (!bookmarkSchema.safeParse(candidate).success) {
        reportError('书签信息格式不对或网址编码后过长', false, false)
        return
      }
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g
          const sorted = sortBookmarksByOrder(g.bookmarks)
          const bm: Bookmark = {
            ...candidate,
            order: sorted.length,
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
      const trimmedUrl = url.trim()
      const finalUrl = /^https?:\/\//i.test(trimmedUrl)
        ? trimmedUrl
        : (normalizeHttpUrl(trimmedUrl) ?? trimmedUrl)
      const rawIcon = icon?.trim() || undefined
      const iconVal =
        !rawIcon || rawIcon.startsWith('builtin:')
          ? rawIcon
          : /^https?:\/\//i.test(rawIcon)
            ? rawIcon
            : (normalizeHttpUrl(rawIcon) ?? rawIcon)
      const noteVal = note?.trim() || undefined

      const candidateCheck = bookmarkSchema.safeParse({
        id: bookmarkId,
        name: trimmedName,
        url: finalUrl,
        order: 0,
        icon: iconVal,
        note: noteVal,
      })
      if (!candidateCheck.success) {
        reportError('书签信息格式不对或网址编码后过长', false, false)
        return
      }

      if (newGroupId && newGroupId !== groupId) {
        const destGroup = groupsRef.current.find((g) => g.id === newGroupId)
        if (destGroup && destGroup.bookmarks.length >= MAX_BOOKMARKS_PER_GROUP) {
          reportError(`该分组已满 ${MAX_BOOKMARKS_PER_GROUP} 个书签`, false, false)
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
                  ? { ...b, name: trimmedName, url: finalUrl, icon: iconVal, note: noteVal }
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
            movedBm = { ...bm, name: trimmedName, url: finalUrl, icon: iconVal, note: noteVal }
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
          reportError(`该分组已满 ${MAX_BOOKMARKS_PER_GROUP} 个书签`, false, false)
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

      // Before initial cloud handshake completes, never mark stale/fallback local data as pending upload.
      // Buffer click deltas and merge them onto cloud data once fetched so fresh edits from other devices survive.
      if (!initialCloudResolvedRef.current) {
        pendingClicksRef.current.set(
          bookmarkId,
          (pendingClicksRef.current.get(bookmarkId) ?? 0) + 1
        )
        const next = increment(groupsRef.current)
        groupsRef.current = next
        setGroupsState(next)
        if (localStatusRef.current === 'valid') {
          saveGroupsLocal(next)
        }
        return
      }

      uncommittedClicksRef.current.set(
        bookmarkId,
        (uncommittedClicksRef.current.get(bookmarkId) ?? 0) + 1
      )
      const next = increment(groupsRef.current)
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

  const toggleGroupCollapsed = useCallback(
    (groupId: string) => {
      const target = groupsRef.current.find((g) => g.id === groupId)
      if (!target) return
      const nextCollapsed = !target.collapsed

      if (!initialCloudResolvedRef.current) {
        pendingCollapseRef.current.set(groupId, nextCollapsed)
        const next = groupsRef.current.map((g) =>
          g.id === groupId ? { ...g, collapsed: nextCollapsed } : g
        )
        groupsRef.current = next
        setGroupsState(next)
        if (localStatusRef.current === 'valid') {
          saveGroupsLocal(next)
        }
        return
      }

      uncommittedCollapseRef.current.set(groupId, nextCollapsed)
      const next = groupsRef.current.map((g) =>
        g.id === groupId ? { ...g, collapsed: nextCollapsed } : g
      )
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
    if (blob.size > MAX_BACKUP_FILE_BYTES) {
      reportError(`备份不能超过 ${MAX_BACKUP_FILE_MB} MB`, false, false)
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mininav-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [reportError])

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
    restoreBookmark,
    restoreGroup,
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
