'use client'

import {
  Server, Database, Globe, Cloud, Terminal, Code2, HardDrive, Cpu,
  Shield, Wifi, Monitor, FileText, Wrench, Gamepad2, Music, Video,
  BookOpen, Mail, MessageSquare, ShoppingCart, Wallet, ChartLine,
  type LucideIcon,
} from 'lucide-react'

export const BUILTIN_ICON_PREFIX = 'builtin:'

export interface BuiltinIconDef {
  id: string
  label: string
  Icon: LucideIcon
}

/** Curated default icon set for bookmarks without a favicon (servers, tools, etc.) */
export const BUILTIN_ICONS: BuiltinIconDef[] = [
  { id: 'server', label: '服务器', Icon: Server },
  { id: 'database', label: '数据库', Icon: Database },
  { id: 'globe', label: '网站', Icon: Globe },
  { id: 'cloud', label: '云服务', Icon: Cloud },
  { id: 'terminal', label: '终端', Icon: Terminal },
  { id: 'code', label: '代码', Icon: Code2 },
  { id: 'harddrive', label: '存储', Icon: HardDrive },
  { id: 'cpu', label: '计算', Icon: Cpu },
  { id: 'shield', label: '安全', Icon: Shield },
  { id: 'wifi', label: '网络', Icon: Wifi },
  { id: 'monitor', label: '监控', Icon: Monitor },
  { id: 'file', label: '文档', Icon: FileText },
  { id: 'wrench', label: '工具', Icon: Wrench },
  { id: 'game', label: '游戏', Icon: Gamepad2 },
  { id: 'music', label: '音乐', Icon: Music },
  { id: 'video', label: '视频', Icon: Video },
  { id: 'book', label: '阅读', Icon: BookOpen },
  { id: 'mail', label: '邮件', Icon: Mail },
  { id: 'chat', label: '聊天', Icon: MessageSquare },
  { id: 'shop', label: '购物', Icon: ShoppingCart },
  { id: 'wallet', label: '钱包', Icon: Wallet },
  { id: 'chart', label: '图表', Icon: ChartLine },
]

export function isBuiltinIcon(icon?: string): boolean {
  return !!icon?.startsWith(BUILTIN_ICON_PREFIX)
}

export function getBuiltinIcon(icon: string): BuiltinIconDef | undefined {
  const id = icon.slice(BUILTIN_ICON_PREFIX.length)
  return BUILTIN_ICONS.find((i) => i.id === id)
}
