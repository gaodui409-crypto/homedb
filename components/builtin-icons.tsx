'use client'

import {
  Server, Database, Cloud, Terminal, HardDrive, Shield, Monitor,
  type LucideIcon,
} from 'lucide-react'

export const BUILTIN_ICON_PREFIX = 'builtin:'

export interface BuiltinIconDef {
  id: string
  label: string
  Icon: LucideIcon
}

/** Curated default icon set, focused on VPS / server bookmarks (other sites usually resolve a favicon) */
export const BUILTIN_ICONS: BuiltinIconDef[] = [
  { id: 'server', label: '服务器', Icon: Server },
  { id: 'database', label: '数据库', Icon: Database },
  { id: 'cloud', label: '云服务', Icon: Cloud },
  { id: 'terminal', label: '终端', Icon: Terminal },
  { id: 'harddrive', label: '存储', Icon: HardDrive },
  { id: 'shield', label: '安全', Icon: Shield },
  { id: 'monitor', label: '监控', Icon: Monitor },
]

export function isBuiltinIcon(icon?: string): boolean {
  return !!icon?.startsWith(BUILTIN_ICON_PREFIX)
}

export function getBuiltinIcon(icon: string): BuiltinIconDef | undefined {
  const id = icon.slice(BUILTIN_ICON_PREFIX.length)
  return BUILTIN_ICONS.find((i) => i.id === id)
}
