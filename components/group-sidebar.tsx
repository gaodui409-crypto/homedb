'use client'

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'

import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
  type SidebarItem,
} from '@/lib/sidebar-navigation'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Drawer,
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
}

interface TouchPointerStart {
  pointerId: number
  x: number
  y: number
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
        const button = (
          <button
            type="button"
            aria-label={label}
            aria-hidden={collapsed && item.disabled ? true : undefined}
            aria-current={active ? 'location' : undefined}
            disabled={item.disabled}
            onClick={() => onSelect(item.id)}
            className={cn(
              'relative flex h-9 w-full min-w-0 items-center rounded-[8px] text-sm outline-none',
              'hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-45',
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

        return (
          <li key={item.id}>
            {collapsed ? (
              <Tooltip>
                {item.disabled ? (
                  <TooltipTrigger asChild>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={label}
                      aria-disabled="true"
                      className="block w-full rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {button}
                    </span>
                  </TooltipTrigger>
                ) : (
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                )}
                <TooltipContent side="right" sideOffset={8}>
                  {label}
                </TooltipContent>
              </Tooltip>
            ) : button}
          </li>
        )
      })}
    </ul>
  )
}

export function DesktopGroupSidebar(props: DesktopGroupSidebarProps) {
  const [collapsed, setCollapsed] = useState(getInitialCollapsedState)

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
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={toggleLabel}
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
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {toggleLabel}
          </TooltipContent>
        </Tooltip>
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
}: MobileGroupDrawerProps) {
  const touchPointer = useRef<TouchPointerStart | null>(null)

  function releaseTouchPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (touchPointer.current?.pointerId !== event.pointerId) return

    touchPointer.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'touch' || touchPointer.current !== null) return

    touchPointer.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = touchPointer.current
    if (start === null || start.pointerId !== event.pointerId) return

    const dx = event.clientX - start.x
    const dy = Math.abs(event.clientY - start.y)

    if (dy > 32) {
      releaseTouchPointer(event)
      return
    }

    if (dx >= 48) {
      releaseTouchPointer(event)
      onOpenChange(true)
    }
  }

  function handleSelect(id: string) {
    onOpenChange(false)
    requestAnimationFrame(() => onSelect(id))
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} direction="left">
        <DrawerContent
          className={cn(
            'h-full w-[min(78vw,320px)] max-w-[320px] sm:max-w-[320px] lg:hidden',
            'data-[vaul-drawer-direction=left]:w-[min(78vw,320px)]',
            'data-[vaul-drawer-direction=left]:sm:max-w-[320px]'
          )}
        >
          <DrawerHeader className="shrink-0 border-b">
            <DrawerTitle>分组</DrawerTitle>
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

      {!open && (
        <div
          aria-hidden="true"
          data-testid="mobile-group-drawer-edge"
          className="fixed bottom-0 left-0 top-14 z-20 w-5 touch-pan-y lg:hidden"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={releaseTouchPointer}
          onPointerCancel={releaseTouchPointer}
        />
      )}
    </>
  )
}
