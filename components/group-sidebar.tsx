'use client'

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'

import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
  type SidebarItem,
} from '@/lib/sidebar-navigation'
import { cn } from '@/lib/utils'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'

export interface GroupSidebarContentProps {
  items: SidebarItem[]
  activeGroupId: string | null
  collapsed?: boolean
  onSelect: (id: string) => void
}

export type DesktopGroupSidebarProps = Omit<
  GroupSidebarContentProps,
  'collapsed'
>

export interface MobileGroupDrawerProps extends GroupSidebarContentProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  triggerRef: RefObject<HTMLButtonElement | null>
}

interface EdgeTouchStart {
  identifier: number
  horizontalIntent: boolean
  x: number
  y: number
}

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)'
const EDGE_SWIPE_TOP = 56
const EDGE_SWIPE_WIDTH = 20
const EDGE_SWIPE_OPEN_DISTANCE = 48
const EDGE_SWIPE_MAX_VERTICAL_DRIFT = 32
const EDGE_SWIPE_INTENT_DISTANCE = 16
const TOUCH_LISTENER_OPTIONS: AddEventListenerOptions = { passive: false }

function findTouch(touches: TouchList, identifier: number): Touch | null {
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches[index]
    if (touch?.identifier === identifier) return touch
  }

  return null
}

function subscribeToDesktop(onStoreChange: () => void): () => void {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return () => {}
  }

  const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY)
  mediaQuery.addEventListener('change', onStoreChange)
  return () => mediaQuery.removeEventListener('change', onStoreChange)
}

function getDesktopSnapshot(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
    ? window.matchMedia(DESKTOP_MEDIA_QUERY).matches
    : false
}

function getServerDesktopSnapshot(): boolean {
  return false
}

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeToDesktop,
    getDesktopSnapshot,
    getServerDesktopSnapshot
  )
}

function getInitialCollapsedState(): boolean {
  if (typeof window === 'undefined') return false

  try {
    return readSidebarCollapsed(window.localStorage)
  } catch {
    return false
  }
}

function getItemLabel(item: SidebarItem): string {
  const matchState = item.disabled ? '，无匹配结果' : ''
  return `${item.name}，${item.count} 个书签${matchState}`
}

export function GroupSidebarContent({
  items,
  activeGroupId,
  collapsed = false,
  onSelect,
}: GroupSidebarContentProps) {
  if (items.length === 0) {
    return collapsed ? null : (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        暂无分组
      </p>
    )
  }

  return (
    <ul className={cn('space-y-1', collapsed ? 'px-2' : 'px-3')}>
      {items.map((item) => {
        const active = item.id === activeGroupId
        const label = getItemLabel(item)
        const unavailableInCollapsed = collapsed && item.disabled
        const button = (
          <button
            type="button"
            aria-label={label}
            title={collapsed ? label : undefined}
            aria-disabled={unavailableInCollapsed ? true : undefined}
            aria-current={active ? 'location' : undefined}
            disabled={item.disabled && !unavailableInCollapsed}
            onClick={item.disabled ? undefined : () => onSelect(item.id)}
            className={cn(
              'relative flex h-9 w-full min-w-0 items-center rounded-[8px] text-sm outline-none',
              'hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-45',
              'aria-disabled:cursor-not-allowed aria-disabled:opacity-45',
              collapsed ? 'justify-center px-0' : 'gap-2 px-3',
              active && [
                'bg-accent font-medium text-accent-foreground',
                'before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-r-sm before:bg-primary',
              ]
            )}
          >
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {!collapsed && (
              <>
                <span
                  className="min-w-0 flex-1 truncate text-left"
                  title={item.name}
                >
                  {item.name}
                </span>
                <span className="w-7 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {item.count}
                </span>
              </>
            )}
          </button>
        )

        return <li key={item.id}>{button}</li>
      })}
    </ul>
  )
}

export function DesktopGroupSidebar(props: DesktopGroupSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    // Keep the first client render identical to the server-rendered shell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(getInitialCollapsedState())
  }, [])

  const toggleLabel = collapsed ? '展开分组侧边栏' : '收起分组侧边栏'

  function handleToggle() {
    const nextCollapsed = !collapsed
    setCollapsed(nextCollapsed)

    try {
      writeSidebarCollapsed(window.localStorage, nextCollapsed)
    } catch {
      // Keep the in-memory toggle when storage access itself is unavailable.
    }
  }

  return (
    <aside
      aria-label="分组侧边栏"
      className={cn(
        'sidebar-transition sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r bg-background lg:flex',
        collapsed ? 'w-14' : 'w-[220px]'
      )}
    >
      <div className={cn(
        'flex h-12 shrink-0 items-center',
        collapsed ? 'justify-center' : 'px-6'
      )}>
        {!collapsed && <h2 className="text-sm font-semibold">分组</h2>}
      </div>

      <nav
        aria-label="书签分组"
        className="min-h-0 flex-1 overflow-y-auto pb-3"
      >
        <GroupSidebarContent {...props} collapsed={collapsed} />
      </nav>

      <div className="flex shrink-0 border-t p-2">
        <button
          type="button"
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-expanded={!collapsed}
          onClick={handleToggle}
          className={cn(
            'flex size-9 items-center justify-center rounded-[8px] text-muted-foreground outline-none',
            'hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring',
            collapsed ? 'mx-auto' : 'ml-auto'
          )}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden="true" className="size-4" />
          ) : (
            <PanelLeftClose aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>
    </aside>
  )
}

export function MobileGroupDrawer({
  items,
  activeGroupId,
  open,
  onOpenChange,
  onSelect,
  triggerRef,
}: MobileGroupDrawerProps) {
  const edgeTouch = useRef<EdgeTouchStart | null>(null)
  const selectionFrame = useRef<number | null>(null)
  const isDesktop = useIsDesktop()
  const effectiveOpen = open && !isDesktop

  useEffect(() => {
    if (isDesktop && open) onOpenChange(false)
  }, [isDesktop, onOpenChange, open])

  useEffect(() => {
    edgeTouch.current = null
    if (open || isDesktop) return

    function handleTouchStart(event: TouchEvent) {
      edgeTouch.current = null
      if (event.touches.length !== 1) return

      const start = event.touches[0]
      if (
        !start ||
        start.clientX > EDGE_SWIPE_WIDTH ||
        start.clientY < EDGE_SWIPE_TOP
      ) return

      edgeTouch.current = {
        identifier: start.identifier,
        horizontalIntent: false,
        x: start.clientX,
        y: start.clientY,
      }
    }

    function handleTouchMove(event: TouchEvent) {
      const start = edgeTouch.current
      if (start === null) return

      if (event.touches.length !== 1) {
        edgeTouch.current = null
        return
      }

      const current = findTouch(event.touches, start.identifier)
      if (current === null) {
        edgeTouch.current = null
        return
      }

      const dx = current.clientX - start.x
      const dy = Math.abs(current.clientY - start.y)
      const absoluteDx = Math.abs(dx)

      if (dy > EDGE_SWIPE_MAX_VERTICAL_DRIFT) {
        edgeTouch.current = null
        return
      }

      if (!start.horizontalIntent) {
        if (dx <= 0 || dy >= absoluteDx) {
          edgeTouch.current = null
          return
        }

        if (Math.max(absoluteDx, dy) < EDGE_SWIPE_INTENT_DISTANCE) return

        start.horizontalIntent = true
      }

      if (dx <= 0 || dy >= absoluteDx) {
        edgeTouch.current = null
        return
      }

      event.preventDefault()

      if (dx >= EDGE_SWIPE_OPEN_DISTANCE) {
        edgeTouch.current = null
        onOpenChange(true)
      }
    }

    function handleTouchEnd(event: TouchEvent) {
      const start = edgeTouch.current
      if (
        start !== null &&
        (findTouch(event.changedTouches, start.identifier) !== null ||
          findTouch(event.touches, start.identifier) === null)
      ) {
        edgeTouch.current = null
      }
    }

    function handleBlur() {
      edgeTouch.current = null
    }

    window.addEventListener('touchstart', handleTouchStart, TOUCH_LISTENER_OPTIONS)
    window.addEventListener('touchmove', handleTouchMove, TOUCH_LISTENER_OPTIONS)
    window.addEventListener('touchend', handleTouchEnd, TOUCH_LISTENER_OPTIONS)
    window.addEventListener('touchcancel', handleTouchEnd, TOUCH_LISTENER_OPTIONS)
    window.addEventListener('blur', handleBlur)

    return () => {
      edgeTouch.current = null
      window.removeEventListener(
        'touchstart',
        handleTouchStart,
        TOUCH_LISTENER_OPTIONS
      )
      window.removeEventListener(
        'touchmove',
        handleTouchMove,
        TOUCH_LISTENER_OPTIONS
      )
      window.removeEventListener(
        'touchend',
        handleTouchEnd,
        TOUCH_LISTENER_OPTIONS
      )
      window.removeEventListener(
        'touchcancel',
        handleTouchEnd,
        TOUCH_LISTENER_OPTIONS
      )
      window.removeEventListener('blur', handleBlur)
    }
  }, [isDesktop, onOpenChange, open])

  useEffect(() => {
    return () => {
      if (selectionFrame.current !== null) {
        cancelAnimationFrame(selectionFrame.current)
      }
    }
  }, [])

  function handleSelect(id: string) {
    if (selectionFrame.current !== null) {
      cancelAnimationFrame(selectionFrame.current)
    }

    onOpenChange(false)
    selectionFrame.current = requestAnimationFrame(() => {
      selectionFrame.current = null
      onSelect(id)
    })
  }

  return (
    <>
      <Drawer
        open={effectiveOpen}
        onOpenChange={onOpenChange}
        direction="left"
        autoFocus
      >
        <DrawerContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (!getDesktopSnapshot()) triggerRef.current?.focus()
          }}
          className={cn(
            'h-full w-[min(78vw,320px)] max-w-[320px] sm:max-w-[320px]',
            'data-[vaul-drawer-direction=left]:w-[min(78vw,320px)]',
            'data-[vaul-drawer-direction=left]:sm:max-w-[320px]'
          )}
        >
          <DrawerHeader className="shrink-0 flex-row items-center justify-between border-b">
            <DrawerTitle>分组</DrawerTitle>
            <DrawerClose asChild>
              <button
                type="button"
                aria-label="关闭分组导航"
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground outline-none',
                  'hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring'
                )}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </DrawerClose>
            <DrawerDescription className="sr-only">
              选择分组后将跳转到对应的书签区域。
            </DrawerDescription>
          </DrawerHeader>
          <nav
            aria-label="书签分组"
            className="min-h-0 flex-1 overflow-y-auto py-3"
          >
            <GroupSidebarContent
              items={items}
              activeGroupId={activeGroupId}
              collapsed={false}
              onSelect={handleSelect}
            />
          </nav>
        </DrawerContent>
      </Drawer>

      {!open && !isDesktop && (
        <div
          aria-hidden="true"
          data-testid="mobile-group-drawer-edge"
          className="pointer-events-none fixed bottom-0 left-0 top-14 z-20 w-5 lg:hidden"
        />
      )}
    </>
  )
}
