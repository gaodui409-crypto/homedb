// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SidebarItem } from '@/lib/sidebar-navigation'
import { MobileGroupDrawer } from './group-sidebar'

vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({
    open,
    children,
  }: {
    open: boolean
    children: ReactNode
  }) => (open ? <>{children}</> : null),
  DrawerContent: ({ children, ...props }: ComponentProps<'div'>) => (
    <div data-slot="drawer-content" {...props}>
      {children}
    </div>
  ),
  DrawerHeader: ({ children, ...props }: ComponentProps<'div'>) => (
    <div {...props}>{children}</div>
  ),
  DrawerTitle: ({ children, ...props }: ComponentProps<'h2'>) => (
    <h2 {...props}>{children}</h2>
  ),
  DrawerDescription: ({ children, ...props }: ComponentProps<'p'>) => (
    <p {...props}>{children}</p>
  ),
}))

const items: SidebarItem[] = [
  {
    id: 'infrastructure',
    name: 'Infrastructure',
    color: '#3B82F6',
    count: 12,
    disabled: false,
  },
  {
    id: 'reference',
    name: 'Reference',
    color: '#10B981',
    count: 0,
    disabled: true,
  },
]

function renderDrawer(
  overrides: Partial<ComponentProps<typeof MobileGroupDrawer>> = {}
) {
  const onOpenChange = overrides.onOpenChange ?? vi.fn()
  const onSelect = overrides.onSelect ?? vi.fn()
  const result = render(
    <MobileGroupDrawer
      items={overrides.items ?? items}
      activeGroupId={overrides.activeGroupId ?? null}
      open={overrides.open ?? false}
      onOpenChange={onOpenChange}
      onSelect={onSelect}
    />
  )

  return { ...result, onOpenChange, onSelect }
}

beforeEach(() => {
  vi.stubGlobal(
    'PointerEvent',
    class PointerEvent extends MouseEvent {
      readonly pointerId: number
      readonly pointerType: string

      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 0
        this.pointerType = init.pointerType ?? ''
      }
    }
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MobileGroupDrawer', () => {
  it('renders shared group names and counts in an expanded left drawer', () => {
    renderDrawer({ open: true, activeGroupId: 'infrastructure' })

    expect(screen.getByRole('heading', { name: '分组' })).toBeTruthy()
    expect(
      screen.getByText('选择分组后将跳转到对应的书签区域。').className
    ).toContain('sr-only')

    const enabled = screen.getByRole('button', {
      name: 'Infrastructure，12 个书签',
    })
    const disabled = screen.getByRole('button', {
      name: 'Reference，0 个书签，无匹配结果',
    })
    expect(within(enabled).getByText('12')).toBeTruthy()
    expect(within(disabled).getByText('0')).toBeTruthy()
    expect(enabled.getAttribute('aria-current')).toBe('location')

    const content = document.querySelector('[data-slot="drawer-content"]')
    expect(content?.className).toContain('h-full')
    expect(content?.className).toContain('w-[min(78vw,320px)]')
    expect(content?.className).toContain('max-w-[320px]')
    expect(content?.className).toContain(
      'data-[vaul-drawer-direction=left]:w-[min(78vw,320px)]'
    )
    expect(content?.className).toContain(
      'data-[vaul-drawer-direction=left]:sm:max-w-[320px]'
    )
    expect(content?.className).toContain('lg:hidden')
    expect(screen.queryByTestId('mobile-group-drawer-edge')).toBeNull()
  })

  it('closes before selecting an enabled group in the next animation frame', async () => {
    const user = userEvent.setup()
    const calls: string[] = []
    let frameCallback: FrameRequestCallback | undefined
    const onOpenChange = vi.fn(() => calls.push('close'))
    const onSelect = vi.fn(() => calls.push('select'))
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frameCallback = callback
        return 1
      })
    )
    renderDrawer({ open: true, onOpenChange, onSelect })

    await user.click(
      screen.getByRole('button', { name: 'Infrastructure，12 个书签' })
    )

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSelect).not.toHaveBeenCalled()
    expect(calls).toEqual(['close'])

    frameCallback?.(0)

    expect(onSelect).toHaveBeenCalledWith('infrastructure')
    expect(calls).toEqual(['close', 'select'])
  })

  it('does not close or select when a disabled group is clicked', async () => {
    const user = userEvent.setup()
    const requestAnimationFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    const { onOpenChange, onSelect } = renderDrawer({ open: true })

    await user.click(
      screen.getByRole('button', {
        name: 'Reference，0 个书签，无匹配结果',
      })
    )

    expect(onOpenChange).not.toHaveBeenCalled()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('opens from the closed left-edge zone after a qualifying touch swipe', () => {
    const { onOpenChange } = renderDrawer()
    const edge = screen.getByTestId('mobile-group-drawer-edge')

    expect(edge.className).toContain('fixed')
    expect(edge.className).toContain('top-14')
    expect(edge.className).toContain('w-5')
    expect(edge.className).toContain('touch-pan-y')
    expect(edge.className).toContain('lg:hidden')

    fireEvent.pointerDown(edge, {
      pointerId: 7,
      pointerType: 'touch',
      clientX: 0,
      clientY: 100,
    })
    fireEvent.pointerMove(edge, {
      pointerId: 7,
      pointerType: 'touch',
      clientX: 48,
      clientY: 132,
    })

    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it.each([
    {
      name: 'short swipe',
      pointerType: 'touch',
      start: [0, 100],
      end: [47, 100],
    },
    {
      name: 'leftward swipe',
      pointerType: 'touch',
      start: [60, 100],
      end: [0, 100],
    },
    {
      name: 'mouse drag',
      pointerType: 'mouse',
      start: [0, 100],
      end: [60, 100],
    },
    {
      name: 'swipe with excessive vertical drift',
      pointerType: 'touch',
      start: [0, 100],
      end: [60, 133],
    },
  ])('ignores a $name', ({ pointerType, start, end }) => {
    const { onOpenChange } = renderDrawer()
    const edge = screen.getByTestId('mobile-group-drawer-edge')

    fireEvent.pointerDown(edge, {
      pointerId: 3,
      pointerType,
      clientX: start[0],
      clientY: start[1],
    })
    fireEvent.pointerMove(edge, {
      pointerId: 3,
      pointerType,
      clientX: end[0],
      clientY: end[1],
    })
    fireEvent.pointerUp(edge, {
      pointerId: 3,
      pointerType,
      clientX: end[0],
      clientY: end[1],
    })

    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
