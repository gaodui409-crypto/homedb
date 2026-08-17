'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { StickyNote } from 'lucide-react'

interface BookmarkNoteProps {
  note: string
}

export function BookmarkNote({ note }: BookmarkNoteProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)
  const tooltipId = useId()

  useEffect(() => {
    if (!open) return

    function handleOutsidePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('pointerdown', handleOutsidePointer)
    return () => document.removeEventListener('pointerdown', handleOutsidePointer)
  }, [open])

  return (
    <span
      ref={containerRef}
      className="relative flex shrink-0"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="查看备注"
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.stopPropagation()
            return
          }
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
        }}
        className="flex size-5 items-center justify-center rounded text-amber-500 outline-none hover:bg-amber-500/10 focus-visible:ring-2 focus-visible:ring-ring"
        title="查看备注"
      >
        <StickyNote aria-hidden="true" className="size-3" />
      </button>

      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute right-0 top-[calc(100%+0.4rem)] z-40 max-h-40 w-max max-w-[min(18rem,calc(100vw-2rem))] overflow-y-auto whitespace-normal break-words rounded-[6px] border border-border bg-popover px-3 py-2 text-left text-xs leading-relaxed text-popover-foreground shadow-lg"
        >
          {note}
        </span>
      )}
    </span>
  )
}
