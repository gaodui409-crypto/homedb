'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Flame, Pencil, Trash2, Pin, PinOff } from 'lucide-react'
import { FaviconImage } from './favicon-image'
import { BookmarkNote } from './bookmark-note'
import { getDomain } from '@/lib/favicon'
import type { Bookmark } from '@/lib/types'

interface BookmarkCardProps {
  bookmark: Bookmark
  adminMode: boolean
  dragEnabled?: boolean
  onEdit: (bookmark: Bookmark) => void
  onDelete: (id: string) => void
  onTogglePin?: (id: string) => void
  onOpen?: (id: string) => void
}

export function BookmarkCard({
  bookmark,
  adminMode,
  dragEnabled = adminMode,
  onEdit,
  onDelete,
  onTogglePin,
  onOpen,
}: BookmarkCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: bookmark.id,
    disabled: !dragEnabled,
    data: { type: 'bookmark', bookmark },
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    rotate: isDragging ? '2deg' : undefined,
    scale: isDragging ? '1.02' : undefined,
    zIndex: isDragging ? 50 : undefined,
    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.18)' : undefined,
  }

  const handleClick = () => {
    // Always open link, even in admin mode (edit via pencil icon only)
    onOpen?.(bookmark.id)
    window.open(bookmark.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(dragEnabled ? { ...attributes, ...listeners } : {})}
      className={`nav-card group relative flex items-center gap-3 rounded-xl bg-card p-3 select-none transition-all duration-200 cursor-pointer ${isDragging ? 'ring-2 ring-primary/40' : ''}`}
      {...(adminMode ? { ...attributes, ...listeners } : {})}
      onClick={handleClick}
      role="link"
      tabIndex={0}
      aria-label={`打开 ${bookmark.name}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      {/* Icon */}
      <FaviconImage
        url={bookmark.url}
        name={bookmark.name}
        customIcon={bookmark.icon}
        className="size-9 rounded-lg"
      />

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex min-w-0 items-center gap-1">
          <p className="min-w-0 flex-1 truncate text-sm font-medium leading-tight text-card-foreground">
            {bookmark.name}
          </p>
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            {(bookmark.clicks ?? 0) >= 3 && (
              <span
                role="img"
                aria-label={`常用，已打开 ${bookmark.clicks} 次`}
                title={`常用，已打开 ${bookmark.clicks} 次`}
                className="flex size-5 items-center justify-center text-orange-500"
              >
                <Flame aria-hidden="true" className="size-3" />
              </span>
            )}
            {bookmark.pinned && (
              <span
                role="img"
                aria-label="重点书签"
                title="重点书签"
                className="flex size-5 items-center justify-center text-primary"
              >
                <Pin aria-hidden="true" className="size-3" />
              </span>
            )}
            {bookmark.note && <BookmarkNote note={bookmark.note} />}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {getDomain(bookmark.url)}
        </p>
      </div>

      {/* Admin Actions - mobile: always visible; desktop: hover to show */}
      {adminMode && (
        <div
          className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {onTogglePin && (
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin(bookmark.id) }}
              className="size-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
              aria-label={bookmark.pinned ? '取消重点' : '标记重点'}
              title={bookmark.pinned ? '取消重点' : '标记重点'}
            >
              {bookmark.pinned ? <PinOff size={12} /> : <Pin size={12} />}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(bookmark) }}
            className="size-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="编辑书签"
            title="编辑"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(bookmark.id) }}
            className="size-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            aria-label="删除书签"
            title="删除"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
