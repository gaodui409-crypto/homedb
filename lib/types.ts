export type Theme = 'light' | 'sepia' | 'dark'

export interface Bookmark {
  id: string
  name: string
  url: string
  order: number
  pinned?: boolean // highlight marker only; never alters manual order
  icon?: string // custom icon URL or builtin:* marker (optional)
  note?: string // user note / annotation (optional)
  clicks?: number // open counter; >= 3 shows flame badge, never alters manual order
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
