import { v4 as uuid } from 'uuid'
import { z } from 'zod'

import type { Bookmark, Group, NavData } from './types'

const DEFAULT_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
]

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function normalizeHttpUrl(value: string): string {
  const trimmed = value.trim()
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(candidate)

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are supported')
  }

  return url.toString()
}

const importUrlSchema = z.string().trim().min(1).transform((value, context) => {
  try {
    return normalizeHttpUrl(value)
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'URL must use HTTP or HTTPS' })
    return z.NEVER
  }
})

const optionalImportUrlSchema = z.preprocess(
  (value) => value === '' || value === null || isLegacyBuiltinIcon(value) ? undefined : value,
  importUrlSchema.optional()
)

function isLegacyBuiltinIcon(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('builtin:')
}

const importBookmarkSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1),
  url: importUrlSchema,
  order: z.number().int().nonnegative().optional(),
  pinned: z.boolean().optional(),
  icon: optionalImportUrlSchema,
})

const importGroupSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1),
  order: z.number().int().nonnegative().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  bookmarks: z.array(importBookmarkSchema).optional().default([]),
})

const importNavDataSchema = z.object({
  groups: z.array(importGroupSchema),
})

const storedUrlSchema = z.string().trim().min(1).refine(isHttpUrl, {
  message: 'URL must use HTTP or HTTPS',
})

const optionalStoredIconSchema = z.preprocess(
  (value) => isLegacyBuiltinIcon(value) ? undefined : value,
  storedUrlSchema.optional()
)

const storedBookmarkSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  url: storedUrlSchema,
  order: z.number().int().nonnegative(),
  pinned: z.boolean().optional(),
  icon: optionalStoredIconSchema,
})

const storedGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  order: z.number().int().nonnegative(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  bookmarks: z.array(storedBookmarkSchema),
})

const storedNavDataSchema = z.object({
  groups: z.array(storedGroupSchema),
})

export function normalizeImportData(
  input: unknown,
  createId: () => string = uuid
): NavData {
  const parsed = importNavDataSchema.parse(input)
  const groups: Group[] = parsed.groups.map((group, groupIndex) => {
    const groupId = group.id ?? createId()
    const bookmarks: Bookmark[] = group.bookmarks.map((bookmark, bookmarkIndex) => ({
      id: bookmark.id ?? createId(),
      name: bookmark.name,
      url: bookmark.url,
      order: bookmark.order ?? bookmarkIndex,
      pinned: bookmark.pinned ?? false,
      icon: bookmark.icon,
    }))

    return {
      id: groupId,
      name: group.name,
      order: group.order ?? groupIndex,
      color: group.color ?? DEFAULT_COLORS[groupIndex % DEFAULT_COLORS.length],
      bookmarks,
    }
  })

  return { groups }
}

export function parseStoredNavData(input: unknown): NavData {
  return storedNavDataSchema.parse(input)
}
