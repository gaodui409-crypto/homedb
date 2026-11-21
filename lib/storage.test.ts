import { describe, expect, it } from 'vitest'
import { DEFAULT_DATA } from './default-data'
import {
  BG_KEY,
  CORRUPT_BACKUP_KEY,
  DEFAULT_TITLE,
  STORAGE_KEY,
  clearToken,
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
  type StorageLike,
} from './storage'

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike & {
  dump: () => Record<string, string>
} {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, val) => {
      map.set(key, val)
    },
    removeItem: (key) => {
      map.delete(key)
    },
    dump: () => Object.fromEntries(map.entries()),
  }
}

describe('storage helpers', () => {
  it('returns DEFAULT_DATA with status missing when storage is empty', () => {
    const storage = createMemoryStorage()
    const loaded = loadStoredGroups(storage)
    expect(loaded.status).toBe('missing')
    expect(loaded.groups).toEqual(DEFAULT_DATA)
  })

  it('backs up original raw JSON before persisting salvaged data', () => {
    const rawPreSalvage = JSON.stringify({
      groups: [
        {
          id: 'g1',
          name: '内网服务',
          order: 0,
          color: '#bad',
          bookmarks: [
            {
              id: 'b1',
              name: 'NAS',
              url: 'http://192.168.1.10:5000',
              order: 0,
              icon: 'ftp://invalid-icon',
            },
          ],
        },
      ],
    })
    const storage = createMemoryStorage({
      [STORAGE_KEY]: rawPreSalvage,
    })

    const loaded = loadStoredGroups(storage)
    expect(loaded.status).toBe('salvaged')
    expect(loaded.groups).toHaveLength(1)
    expect(loaded.groups[0].bookmarks[0].name).toBe('NAS')
    expect(loaded.groups[0].bookmarks[0].icon).toBeUndefined()
    expect(storage.getItem(CORRUPT_BACKUP_KEY)).toBe(rawPreSalvage)
  })

  it('backs up corrupt raw JSON before falling back to DEFAULT_DATA', () => {
    const rawCorrupt = '{not valid json'
    const storage = createMemoryStorage({ [STORAGE_KEY]: rawCorrupt })

    const loaded = loadStoredGroups(storage)
    expect(loaded.status).toBe('corrupt')
    expect(loaded.groups).toEqual(DEFAULT_DATA)
    expect(storage.getItem(CORRUPT_BACKUP_KEY)).toBe(rawCorrupt)
  })

  it('reports false instead of crashing when localStorage quota is exceeded', () => {
    const fullStorage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    }

    expect(saveGroupsLocal(DEFAULT_DATA, fullStorage)).toBe(false)
    expect(saveTheme('dark', fullStorage)).toBe(false)
    expect(saveTitle('新标题', fullStorage)).toBe(false)
    expect(saveBackground({ type: 'none' }, fullStorage)).toBe(false)
    expect(setToken('tok', fullStorage)).toBe(false)
  })

  it('validates theme, title, token, and background protocols safely', () => {
    const storage = createMemoryStorage({
      mininav_theme: 'unexpected',
      mininav_title: '   ',
      [BG_KEY]: JSON.stringify({ type: 'image', value: 'javascript:alert(1)' }),
    })

    expect(loadTheme(storage)).toBe('light')
    expect(loadTitle(storage)).toBe(DEFAULT_TITLE)
    expect(loadBackground(storage)).toEqual({ type: 'none' })

    expect(saveBackground({ type: 'image', value: 'javascript:alert(1)' }, storage)).toBe(false)
    expect(saveBackground({ type: 'image', value: 'https://img.example.com/bg.jpg' }, storage)).toBe(true)
    expect(loadBackground(storage)).toEqual({
      type: 'image',
      value: 'https://img.example.com/bg.jpg',
    })

    expect(setToken('secret-token', storage)).toBe(true)
    expect(getToken(storage)).toBe('secret-token')
    clearToken(storage)
    expect(getToken(storage)).toBeNull()
  })
})
