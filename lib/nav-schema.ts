import { z } from 'zod'

const MAX_GROUPS = 100
const MAX_BOOKMARKS_PER_GROUP = 500

export function normalizeHttpUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

const httpUrlSchema = z.string().trim().min(1).max(2048).refine(
  (value) => /^https?:\/\//i.test(value) && normalizeHttpUrl(value) !== null,
  '仅支持完整的 HTTP/HTTPS URL'
)

const iconSchema = z.string().trim().max(2048).refine(
  (value) =>
    value.startsWith('builtin:') ||
    (/^https?:\/\//i.test(value) && normalizeHttpUrl(value) !== null),
  '图标仅支持内置图标或完整的 HTTP/HTTPS URL'
)

export const bookmarkSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  url: httpUrlSchema,
  order: z.number().int().nonnegative().max(100000),
  pinned: z.boolean().optional(),
  icon: iconSchema.optional(),
  note: z.string().trim().max(500).optional(),
  clicks: z.number().int().nonnegative().max(1000000000).optional(),
})

export const groupSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  order: z.number().int().nonnegative().max(100000),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  bookmarks: z.array(bookmarkSchema).max(MAX_BOOKMARKS_PER_GROUP),
  collapsed: z.boolean().optional(),
})

export const navDataSchema = z.object({
  groups: z.array(groupSchema).max(MAX_GROUPS),
})

const importBookmarkSchema = bookmarkSchema.partial({
  id: true,
  order: true,
})

const importGroupSchema = groupSchema.extend({
  id: groupSchema.shape.id.optional(),
  order: groupSchema.shape.order.optional(),
  color: groupSchema.shape.color.optional(),
  bookmarks: z.array(importBookmarkSchema).max(MAX_BOOKMARKS_PER_GROUP).optional(),
})

export const importNavDataSchema = z.object({
  groups: z.array(importGroupSchema).max(MAX_GROUPS),
})

export type ImportNavData = z.infer<typeof importNavDataSchema>
