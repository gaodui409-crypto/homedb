export type Theme = 'light' | 'sepia' | 'dark'

export interface Bookmark {
  id: string
  name: string
  url: string
  order: number
  pinned?: boolean // pinned to the quick-access bar
  icon?: string // custom icon URL (optional)
  note?: string // user note / annotation (optional)
  clicks?: number // click counter for "most visited"
}

export interface Group {
  id: string
  name: string
  order: number
  color: string
  bookmarks: Bookmark[]
  collapsed?: boolean // collapsed state, synced to cloud
}

export type BackgroundSetting =
  | { type: 'none' }
  | { type: 'color'; value: string }
  | { type: 'image'; value: string }

export interface NavData {
  groups: Group[]
}
