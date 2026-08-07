import type { Group } from './types'

export const SIDEBAR_COLLAPSED_KEY = 'mininav_sidebar_collapsed'

export interface SidebarItem {
  id: string
  name: string
  color: string
  count: number
  disabled: boolean
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase()
}

export function buildSidebarItems(groups: Group[], query: string): SidebarItem[] {
  const normalizedQuery = normalizeSearchQuery(query)
  const hasQuery = normalizedQuery.length > 0

  return groups.map((group) => {
    const count = hasQuery
      ? group.bookmarks.filter((bookmark) =>
          bookmark.name.toLowerCase().includes(normalizedQuery) ||
          bookmark.url.toLowerCase().includes(normalizedQuery)
        ).length
      : group.bookmarks.length

    return {
      id: group.id,
      name: group.name,
      color: group.color,
      count,
      disabled: hasQuery && count === 0,
    }
  })
}

export function resolveActiveGroupId(
  groupIds: string[],
  currentId: string | null
): string | null {
  if (currentId !== null && groupIds.includes(currentId)) {
    return currentId
  }

  return groupIds[0] ?? null
}

export function readSidebarCollapsed(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function writeSidebarCollapsed(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  collapsed: boolean
): void {
  try {
    if (collapsed) {
      storage.setItem(SIDEBAR_COLLAPSED_KEY, '1')
    } else {
      storage.removeItem(SIDEBAR_COLLAPSED_KEY)
    }
  } catch {
    // Storage may be unavailable in privacy modes or restricted environments.
  }
}
