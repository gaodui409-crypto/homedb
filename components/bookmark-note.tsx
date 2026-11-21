'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { StickyNote } from 'lucide-react'

interface BookmarkNoteProps {
  note: string
}

export function BookmarkNote({ note }: BookmarkNoteProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)
  const pointerDownActiveRef = useRef(false)
  const openedByHoverRef = useRef(false)
  const tooltipId = useId()

  useEffect(() => {
    if (!open) return

    function handleOutsidePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        pointerDownActiveRef.current = false
        openedByHoverRef.current = false
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handleOutsidePointer)
    return () => document.removeEventListener('pointerdown', handleOutsidePointer)
  }, [open])

  return (
    <span
      ref={containerRef}
      className="relative flex shrink-0"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') {
          if (!open) openedByHoverRef.current = true
          setOpen(true)
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') {
          openedByHoverRef.current = false
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        aria-label="查看备注"
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onPointerDown={(event) => {
          event.stopPropagation()
          pointerDownActiveRef.current = true
        }}
        onPointerCancel={() => {
          pointerDownActiveRef.current = false
        }}
        onClick={(event) => {
          event.stopPropagation()
          pointerDownActiveRef.current = false

          if (event.detail === 0) {
            setOpen(true)
            return
          }

          if (openedByHoverRef.current) {
            openedByHoverRef.current = false
            setOpen(true)
            return
          }

          setOpen((prev) => !prev)
        }}
        onFocus={() => {
          if (!pointerDownActiveRef.current) {
            setOpen(true)
          }
        }}
        onBlur={(event) => {
          if (containerRef.current?.contains(event.relatedTarget as Node | null)) {
            return
          }
          pointerDownActiveRef.current = false
          openedByHoverRef.current = false
          setOpen(false)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.stopPropagation()
            return
          }
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          openedByHoverRef.current = false
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
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute right-0 top-[calc(100%+0.35rem)] z-40 max-h-40 w-max max-w-[min(14.5rem,calc(100vw-2rem))] overflow-y-auto whitespace-normal break-words rounded-lg border border-border bg-popover px-3 py-2 text-left text-xs leading-relaxed text-popover-foreground shadow-lg select-text cursor-auto before:content-[''] before:absolute before:-top-2 before:inset-x-0 before:h-2"
        >
          {note}
        </span>
      )}
    </span>
  )
}
