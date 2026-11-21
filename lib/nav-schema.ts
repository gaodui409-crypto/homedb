import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import type { Bookmark, Group } from './types'

export const MAX_GROUPS = 100
export const MAX_BOOKMARKS_PER_GROUP = 500
export const MAX_ORDER = 100000
export const MAX_CLICKS = 1000000000

export const DEFAULT_GROUP_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
] as const

export function normalizeHttpUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    if (!url.hostname) return null
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function emptyToUndefined(value: unknown): unknown {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}

function hasDuplicateIds(groups: ReadonlyArray<{ id: string; bookmarks: ReadonlyArray<{ id: string }> }>): boolean {
  const gIds = new Set<string>()
  const bIds = new Set<string>()
  for (const g of groups) {
    if (gIds.has(g.id)) return true
    gIds.add(g.id)
    for (const b of g.bookmarks) {
      if (bIds.has(b.id)) return true
      bIds.add(b.id)
    }
  }
  return false
}

const httpUrlSchema = z.string().trim().min(1).max(2048).refine(
  (value) => /^https?:\/\//i.test(value) && normalizeHttpUrl(value) !== null,
  '仅支持完整的 HTTP/HTTPS URL'
)

const iconValueSchema = z.string().trim().min(1).max(2048).refine(
  (value) =>
    (value.startsWith('builtin:') && value.length > 'builtin:'.length) ||
    (/^https?:\/\//i.test(value) && normalizeHttpUrl(value) !== null),
  '图标仅支持内置图标或完整的 HTTP/HTTPS URL'
)

const optionalIconSchema = z.preprocess(emptyToUndefined, iconValueSchema.optional())
const optionalNoteSchema = z.preprocess(
  emptyToUndefined,
  z.string().trim().max(500).optional()
)

export const bookmarkSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  url: httpUrlSchema,
  order: z.number().int().nonnegative().max(MAX_ORDER),
  pinned: z.boolean().optional(),
  icon: optionalIconSchema,
  note: optionalNoteSchema,
  clicks: z.number().int().nonnegative().max(MAX_CLICKS).optional(),
})

export const groupSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  order: z.number().int().nonnegative().max(MAX_ORDER),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  bookmarks: z.array(bookmarkSchema).max(MAX_BOOKMARKS_PER_GROUP),
  collapsed: z.boolean().optional(),
})

export const navDataSchema = z
  .object({
    groups: z.array(groupSchema).max(MAX_GROUPS),
  })
  .refine((data) => !hasDuplicateIds(data.groups), '存在重复的分组或书签 ID')

const importBookmarkSchema = bookmarkSchema.extend({
  id: z.preprocess(emptyToUndefined, bookmarkSchema.shape.id.optional()),
  order: bookmarkSchema.shape.order.optional(),
})

const importGroupSchema = groupSchema.extend({
  id: z.preprocess(emptyToUndefined, groupSchema.shape.id.optional()),
  order: groupSchema.shape.order.optional(),
  color: z.preprocess(emptyToUndefined, groupSchema.shape.color.optional()),
  bookmarks: z.array(importBookmarkSchema).max(MAX_BOOKMARKS_PER_GROUP).optional(),
})

export const importNavDataSchema = z.object({
  groups: z.array(importGroupSchema).max(MAX_GROUPS),
})

export type ImportNavData = z.infer<typeof importNavDataSchema>

function allocateUniqueId(
  candidate: string | undefined,
  seen: Set<string>,
  createId: () => string
): string {
  const trimmed = candidate?.trim()
  if (trimmed && trimmed.length <= 100 && !seen.has(trimmed)) {
    seen.add(trimmed)
    return trimmed
  }
  let generated = createId()
  while (seen.has(generated)) {
    generated = createId()
  }
  seen.add(generated)
  return generated
}

export function normalizeImportData(
  input: unknown,
  createId: () => string = uuid
): Group[] {
  const parsed = importNavDataSchema.parse(input)
  const seenGroupIds = new Set<string>()
  const seenBookmarkIds = new Set<string>()

  return parsed.groups.map((g, gIndex) => {
    const groupId = allocateUniqueId(g.id, seenGroupIds, createId)
    const groupColor =
      g.color ?? DEFAULT_GROUP_COLORS[gIndex % DEFAULT_GROUP_COLORS.length]

    const normalizedBookmarks: Bookmark[] = (g.bookmarks ?? []).map((b, bIndex) => ({
      id: allocateUniqueId(b.id, seenBookmarkIds, createId),
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
}

export function mergeNavGroups(existing: Group[], incoming: Group[]): Group[] {
  const sortedExisting = [...existing].sort((a, b) => a.order - b.order)
  const sortedIncoming = [...incoming].sort((a, b) => a.order - b.order)
  const usedBookmarkIds = new Set<string>()

  const merged: Group[] = sortedExisting.slice(0, MAX_GROUPS).map((group) => {
    const sortedBookmarks = [...group.bookmarks]
      .sort((a, b) => a.order - b.order)
      .slice(0, MAX_BOOKMARKS_PER_GROUP)
      .map((bm, index) => {
        usedBookmarkIds.add(bm.id)
        return { ...bm, order: index }
      })
    return {
      ...group,
      bookmarks: sortedBookmarks,
    }
  })

  for (const incGroup of sortedIncoming) {
    const incomingBookmarks = [...incGroup.bookmarks]
      .sort((a, b) => a.order - b.order)
      .filter((bm) => {
        if (usedBookmarkIds.has(bm.id)) return false
        return true
      })

    const targetIndex = merged.findIndex((g) => g.id === incGroup.id)
    if (targetIndex !== -1) {
      const current = merged[targetIndex]
      const capacity = Math.max(0, MAX_BOOKMARKS_PER_GROUP - current.bookmarks.length)
      const accepted = incomingBookmarks.slice(0, capacity)
      for (const bm of accepted) usedBookmarkIds.add(bm.id)
      const combined = [...current.bookmarks, ...accepted].map((bm, idx) => ({
        ...bm,
        order: idx,
      }))
      merged[targetIndex] = {
        ...current,
        bookmarks: combined,
      }
    } else if (merged.length < MAX_GROUPS) {
      const accepted = incomingBookmarks.slice(0, MAX_BOOKMARKS_PER_GROUP)
      for (const bm of accepted) usedBookmarkIds.add(bm.id)
      merged.push({
        ...incGroup,
        bookmarks: accepted.map((bm, idx) => ({ ...bm, order: idx })),
      })
    }
  }

  return merged.map((group, index) => ({
    ...group,
    order: index,
  }))
}

function fallbackBookmarkName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').slice(0, 100) || '未命名书签'
  } catch {
    return '未命名书签'
  }
}

export function salvageNavData(
  input: unknown,
  createId: () => string = uuid
): { groups: Group[]; salvaged: boolean } | null {
  const strict = navDataSchema.safeParse(input)
  if (strict.success) {
    return { groups: strict.data.groups, salvaged: false }
  }

  if (!input || typeof input !== 'object') return null
  const rawGroups = (input as { groups?: unknown }).groups
  if (!Array.isArray(rawGroups)) return null

  if (rawGroups.length === 0) {
    return { groups: [], salvaged: false }
  }

  const seenGroupIds = new Set<string>()
  const seenBookmarkIds = new Set<string>()
  const salvagedGroups: Group[] = []

  for (const rawGroup of rawGroups.slice(0, MAX_GROUPS)) {
    if (!rawGroup || typeof rawGroup !== 'object') continue
    const g = rawGroup as Record<string, unknown>
    const rawGroupName = typeof g.name === 'string' ? g.name.trim() : ''

    const bookmarks: Bookmark[] = []
    if (Array.isArray(g.bookmarks)) {
      for (const rawBm of g.bookmarks.slice(0, MAX_BOOKMARKS_PER_GROUP)) {
        if (!rawBm || typeof rawBm !== 'object') continue
        const b = rawBm as Record<string, unknown>
        if (typeof b.url !== 'string') continue

        const trimmedUrl = b.url.trim()
        const normalizedUrl = normalizeHttpUrl(trimmedUrl)
        if (!normalizedUrl || trimmedUrl.length > 2048) continue
        const finalUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : normalizedUrl

        const rawBmName = typeof b.name === 'string' ? b.name.trim() : ''
        const bmName = (rawBmName || fallbackBookmarkName(finalUrl)).slice(0, 100)

        const bmIndex = bookmarks.length
        const bmId = allocateUniqueId(
          typeof b.id === 'string' ? b.id : undefined,
          seenBookmarkIds,
          createId
        )
        const bmOrder =
          typeof b.order === 'number' &&
          Number.isInteger(b.order) &&
          b.order >= 0 &&
          b.order <= MAX_ORDER
            ? b.order
            : bmIndex
        const pinned = typeof b.pinned === 'boolean' ? b.pinned : undefined
        const parsedIcon = optionalIconSchema.safeParse(b.icon)
        const icon = parsedIcon.success ? parsedIcon.data : undefined
        const note =
          typeof b.note === 'string' && b.note.trim()
            ? b.note.trim().slice(0, 500)
            : undefined
        const clicks =
          typeof b.clicks === 'number' &&
          Number.isInteger(b.clicks) &&
          b.clicks >= 0 &&
          b.clicks <= MAX_CLICKS
            ? b.clicks
            : undefined

        bookmarks.push({
          id: bmId,
          name: bmName,
          url: finalUrl,
          order: bmOrder,
          ...(pinned !== undefined ? { pinned } : {}),
          ...(icon !== undefined ? { icon } : {}),
          ...(note !== undefined ? { note } : {}),
          ...(clicks !== undefined ? { clicks } : {}),
        })
      }
    }

    // Skip unrecognizable objects that have neither a group name nor salvageable bookmarks
    if (!rawGroupName && bookmarks.length === 0) continue

    const groupIndex = salvagedGroups.length
    const id = allocateUniqueId(
      typeof g.id === 'string' ? g.id : undefined,
      seenGroupIds,
      createId
    )
    const name = (rawGroupName || '未命名分组').slice(0, 100)
    const order =
      typeof g.order === 'number' &&
      Number.isInteger(g.order) &&
      g.order >= 0 &&
      g.order <= MAX_ORDER
        ? g.order
        : groupIndex
    const color =
      typeof g.color === 'string' && /^#[0-9a-f]{6}$/i.test(g.color)
        ? g.color
        : DEFAULT_GROUP_COLORS[groupIndex % DEFAULT_GROUP_COLORS.length]
    const collapsed = typeof g.collapsed === 'boolean' ? g.collapsed : undefined

    salvagedGroups.push({
      id,
      name,
      order,
      color,
      bookmarks,
      ...(collapsed !== undefined ? { collapsed } : {}),
    })
  }

  if (salvagedGroups.length === 0) return null
  return { groups: salvagedGroups, salvaged: true }
}
