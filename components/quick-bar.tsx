'use client'

import { Search, X, Flame } from 'lucide-react'
import { FaviconImage } from './favicon-image'
import type { Group, Bookmark } from '@/lib/types'

interface QuickBarProps {
  groups: Group[]
  pinnedBookmarks: { bookmark: Bookmark; groupId: string }[]
  frequentBookmarks: Bookmark[]
  adminMode: boolean
  searchQuery: string
  onSearchChange: (query: string) => void
  onOpenBookmark: (bookmarkId: string) => void
}

function QuickItem({
  bookmark,
  onOpen,
  badge,
}: {
  bookmark: Bookmark
  onOpen: (id: string) => void
  badge?: React.ReactNode
}) {
  return (
    <a
      href={bookmark.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onOpen(bookmark.id)}
      className="group relative flex flex-col items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-accent transition-colors cursor-pointer min-w-[56px] max-w-[72px]"
      title={bookmark.note ? `${bookmark.name} — ${bookmark.note}` : bookmark.name}
    >
      <div className="relative">
        <div className="shadow-sm group-hover:scale-105 transition-transform">
          <FaviconImage
            url={bookmark.url}
            name={bookmark.name}
            customIcon={bookmark.icon}
            className="size-9 rounded-xl"
          />
        </div>
        {badge}
      </div>
      <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors truncate w-full text-center leading-tight">
        {bookmark.name}
      </span>
    </a>
  )
}

export function QuickBar({
  groups,
  pinnedBookmarks,
  frequentBookmarks,
  adminMode,
  searchQuery,
  onSearchChange,
  onOpenBookmark,
}: QuickBarProps) {
  const hasPinned = pinnedBookmarks.length > 0
  const hasFrequent = frequentBookmarks.length > 0

  return (
    <div className="sticky top-14 z-30 border-b border-border bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Group anchor nav + Search */}
        <div className="flex items-center gap-2 py-2">
          {/* Group links - scrollable */}
          <div className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0">
            {groups.map((group) => (
              <a
                key={group.id}
                href={`#group-${group.id}`}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors whitespace-nowrap flex-shrink-0"
              >
                <span
                  className="size-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: group.color }}
                />
                {group.name}
              </a>
            ))}
          </div>

          {/* Search box */}
          <div className="relative flex-shrink-0">
            <div className="flex items-center h-8 rounded-lg border border-border bg-background overflow-hidden transition-all focus-within:ring-2 focus-within:ring-primary/30">
              <Search size={14} className="ml-2.5 text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                placeholder="搜索书签..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-24 sm:w-32 h-full px-2 text-xs bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="mr-1.5 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="清除搜索"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Pinned + Frequent quick-access row */}
        {(hasPinned || hasFrequent || adminMode) && !searchQuery && (
          <div className="pb-2">
            <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
              {pinnedBookmarks.map(({ bookmark }) => (
                <QuickItem key={bookmark.id} bookmark={bookmark} onOpen={onOpenBookmark} />
              ))}

              {/* Divider between pinned and frequent */}
              {hasPinned && hasFrequent && (
                <div className="self-stretch w-px bg-border mx-1.5 my-2 flex-shrink-0" aria-hidden="true" />
              )}

              {frequentBookmarks.map((bookmark) => (
                <QuickItem
                  key={`freq-${bookmark.id}`}
                  bookmark={bookmark}
                  onOpen={onOpenBookmark}
                  badge={
                    <span
                      className="absolute -top-1 -right-1 flex items-center justify-center size-4 rounded-full bg-background border border-border text-orange-500"
                      title="最常访问"
                    >
                      <Flame size={9} />
                    </span>
                  }
                />
              ))}

              {!hasPinned && !hasFrequent && adminMode && (
                <p className="text-xs text-muted-foreground py-2 px-1">
                  在书签卡片上点击图钉图标，将其添加到常用应用栏；高频点击的书签会自动出现在这里
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
