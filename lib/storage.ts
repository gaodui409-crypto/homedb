import { DEFAULT_DATA } from './default-data'
import { normalizeHttpUrl, salvageNavData } from './nav-schema'
import type { BackgroundSetting, Group, Theme } from './types'

export const STORAGE_KEY = 'mininav_data'
export const CORRUPT_BACKUP_KEY = 'mininav_data_backup'
export const THEME_KEY = 'mininav_theme'
export const TITLE_KEY = 'mininav_title'
export const TOKEN_KEY = 'mininav_token'
export const BG_KEY = 'mininav_bg'

export const DEFAULT_TITLE = '我的导航'

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type LocalGroupsStatus = 'missing' | 'valid' | 'salvaged' | 'corrupt'

export interface LoadedGroupsResult {
  groups: Group[]
  status: LocalGroupsStatus
}

const VALID_THEMES: readonly Theme[] = ['light', 'sepia', 'dark']

export function getBrowserStorage(override?: StorageLike | null): StorageLike | null {
  if (override !== undefined) return override
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadStoredGroups(storage?: StorageLike | null): LoadedGroupsResult {
  const target = getBrowserStorage(storage)
  if (!target) {
    return { groups: DEFAULT_DATA, status: 'missing' }
  }

  let raw: string | null = null
  try {
    raw = target.getItem(STORAGE_KEY)
  } catch {
    return { groups: DEFAULT_DATA, status: 'missing' }
  }

  if (raw === null) {
    return { groups: DEFAULT_DATA, status: 'missing' }
  }

  try {
    const parsedJson: unknown = JSON.parse(raw)
    const recovered = salvageNavData(parsedJson)
    if (!recovered) {
      backupRawPayload(target, raw)
      return { groups: DEFAULT_DATA, status: 'corrupt' }
    }

    if (recovered.salvaged) {
      // Preserve original pre-salvage JSON before writing normalized recovery
      backupRawPayload(target, raw)
      saveGroupsLocal(recovered.groups, target)
      return { groups: recovered.groups, status: 'salvaged' }
    }

    return { groups: recovered.groups, status: 'valid' }
  } catch {
    backupRawPayload(target, raw)
    return { groups: DEFAULT_DATA, status: 'corrupt' }
  }
}

function backupRawPayload(storage: StorageLike, raw: string): void {
  try {
    storage.setItem(CORRUPT_BACKUP_KEY, raw)
  } catch {
    // Best-effort backup when storage is full or read-only.
  }
}

export function saveGroupsLocal(groups: Group[], storage?: StorageLike | null): boolean {
  const target = getBrowserStorage(storage)
  if (!target) return false
  try {
    target.setItem(STORAGE_KEY, JSON.stringify({ groups }))
    return true
  } catch {
    return false
  }
}

export function loadTheme(storage?: StorageLike | null): Theme {
  const target = getBrowserStorage(storage)
  if (!target) return 'light'
  try {
    const raw = target.getItem(THEME_KEY)
    return VALID_THEMES.includes(raw as Theme) ? (raw as Theme) : 'light'
  } catch {
    return 'light'
  }
}

export function saveTheme(theme: Theme, storage?: StorageLike | null): boolean {
  const target = getBrowserStorage(storage)
  if (!target) return false
  try {
    target.setItem(THEME_KEY, theme)
    return true
  } catch {
    return false
  }
}

export function loadTitle(storage?: StorageLike | null): string {
  const target = getBrowserStorage(storage)
  if (!target) return DEFAULT_TITLE
  try {
    const raw = target.getItem(TITLE_KEY)?.trim()
    return raw ? raw.slice(0, 30) : DEFAULT_TITLE
  } catch {
    return DEFAULT_TITLE
  }
}

export function saveTitle(title: string, storage?: StorageLike | null): boolean {
  const target = getBrowserStorage(storage)
  if (!target) return false
  try {
    target.setItem(TITLE_KEY, title.trim().slice(0, 30) || DEFAULT_TITLE)
    return true
  } catch {
    return false
  }
}

export function loadBackground(storage?: StorageLike | null): BackgroundSetting {
  const target = getBrowserStorage(storage)
  if (!target) return { type: 'none' }
  try {
    const raw = target.getItem(BG_KEY)
    if (!raw) return { type: 'none' }
    const parsed = JSON.parse(raw) as Partial<BackgroundSetting>
    if (parsed.type === 'none') return { type: 'none' }
    if (
      parsed.type === 'color' &&
      typeof parsed.value === 'string' &&
      /^#[0-9a-f]{3,8}$/i.test(parsed.value.trim())
    ) {
      return { type: 'color', value: parsed.value.trim() }
    }
    if (parsed.type === 'image' && typeof parsed.value === 'string') {
      const safeUrl = normalizeHttpUrl(parsed.value)
      if (safeUrl) return { type: 'image', value: safeUrl }
    }
    return { type: 'none' }
  } catch {
    return { type: 'none' }
  }
}

export function saveBackground(
  background: BackgroundSetting,
  storage?: StorageLike | null
): boolean {
  const target = getBrowserStorage(storage)
  if (!target) return false
  try {
    if (background.type === 'image') {
      const safeUrl = normalizeHttpUrl(background.value)
      if (!safeUrl) return false
      target.setItem(BG_KEY, JSON.stringify({ type: 'image', value: safeUrl }))
      return true
    }
    target.setItem(BG_KEY, JSON.stringify(background))
    return true
  } catch {
    return false
  }
}

export function getToken(storage?: StorageLike | null): string | null {
  const target = getBrowserStorage(storage)
  if (!target) return null
  try {
    return target.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string, storage?: StorageLike | null): boolean {
  const target = getBrowserStorage(storage)
  if (!target) return false
  try {
    target.setItem(TOKEN_KEY, token)
    return true
  } catch {
    return false
  }
}

export function clearToken(storage?: StorageLike | null): void {
  const target = getBrowserStorage(storage)
  if (!target) return
  try {
    target.removeItem(TOKEN_KEY)
  } catch {
    // Ignore restricted storage removal failures.
  }
}
