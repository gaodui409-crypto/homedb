// @vitest-environment jsdom

import {
  createRef,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SidebarItem } from '@/lib/sidebar-navigation'
import { MobileGroupDrawer } from './group-sidebar'

const drawerMockState = vi.hoisted(() => ({
  onCloseAutoFocus: undefined as
    | ((event: { preventDefault: () => void }) => void)
    | undefined,
}))

vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({
    open,
    autoFocus,
    children,
  }: {
    open: boolean
    autoFocus?: boolean
    children: ReactNode
  }) => (
    <div
      data-testid="drawer-root"
      data-open={open}
      data-auto-focus={autoFocus}
    >
      {open ? children : null}
    </div>
  ),
  DrawerContent: ({
    children,
    onCloseAutoFocus,
    ...props
  }: ComponentProps<'div'> & {
    onCloseAutoFocus?: (event: { preventDefault: () => void }) => void
  }) => {
    drawerMockState.onCloseAutoFocus = onCloseAutoFocus
    return (
      <div data-slot="drawer-content" {...props}>
        {children}
      </div>
    )
  },
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

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)'

type DrawerPropsWithTrigger = ComponentProps<typeof MobileGroupDrawer> & {
  triggerRef: RefObject<HTMLButtonElement | null>
}

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const addEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'change' && typeof listener === 'function') {
        listeners.add(listener as (event: MediaQueryListEvent) => void)
      }
    }
  )
  const removeEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'change' && typeof listener === 'function') {
        listeners.delete(listener as (event: MediaQueryListEvent) => void)
      }
    }
  )
  const mediaQueryList = {
    get matches() {
      return matches
    },
    media: DESKTOP_MEDIA_QUERY,
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList
  const matchMedia = vi.fn(() => mediaQueryList)

  vi.stubGlobal('matchMedia', matchMedia)

  return {
    addEventListener,
    matchMedia,
    removeEventListener,
    setMatches(nextMatches: boolean) {
      matches = nextMatches
      const event = {
        matches,
        media: DESKTOP_MEDIA_QUERY,
      } as MediaQueryListEvent
      for (const listener of listeners) listener(event)
    },
  }
}

function installAnimationFrame() {
  let nextFrameId = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const frameId = nextFrameId++
    callbacks.set(frameId, callback)
    return frameId
  })
  const cancelAnimationFrame = vi.fn((frameId: number) => {
    callbacks.delete(frameId)
  })

  vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

  return {
    cancelAnimationFrame,
    requestAnimationFrame,
    run(frameId: number) {
      const callback = callbacks.get(frameId)
      callbacks.delete(frameId)
      callback?.(0)
    },
  }
}

let desktopMedia: ReturnType<typeof installMatchMedia>

function renderDrawer(
  overrides: Partial<DrawerPropsWithTrigger> = {}
) {
  const props: DrawerPropsWithTrigger = {
    items,
    activeGroupId: null,
    open: false,
    onOpenChange: vi.fn(),
    onSelect: vi.fn(),
    triggerRef: createRef<HTMLButtonElement>(),
    ...overrides,
  }
  const result = render(
    <MobileGroupDrawer {...props} />
  )

  return {
    ...result,
    onOpenChange: props.onOpenChange,
    onSelect: props.onSelect,
    triggerRef: props.triggerRef,
    rerenderDrawer(nextProps: Partial<DrawerPropsWithTrigger>) {
      Object.assign(props, nextProps)
      result.rerender(<MobileGroupDrawer {...props} />)
    },
  }
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
  desktopMedia = installMatchMedia(false)
})

afterEach(() => {
  cleanup()
  drawerMockState.onCloseAutoFocus = undefined
  vi.unstubAllGlobals()
})

describe('MobileGroupDrawer', () => {
  it('enables drawer autofocus and restores focus through close autofocus', () => {
    const triggerRef = createRef<HTMLButtonElement>()
    render(<button ref={triggerRef}>Navigation trigger</button>)
    renderDrawer({ open: true, triggerRef })
    const preventDefault = vi.fn()

    expect(screen.getByTestId('drawer-root').getAttribute('data-auto-focus')).toBe(
      'true'
    )
    expect(drawerMockState.onCloseAutoFocus).toEqual(expect.any(Function))

    act(() => {
      drawerMockState.onCloseAutoFocus?.({ preventDefault })
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(triggerRef.current)
  })

  it('keeps Vaul closed and omits mobile UI on desktop despite external open state', () => {
    desktopMedia.setMatches(true)

    renderDrawer({ open: true })

    expect(screen.getByTestId('drawer-root').getAttribute('data-open')).toBe(
      'false'
    )
    expect(document.querySelector('[data-slot="drawer-content"]')).toBeNull()
    expect(screen.queryByTestId('mobile-group-drawer-edge')).toBeNull()
    expect(desktopMedia.matchMedia).toHaveBeenCalledWith(DESKTOP_MEDIA_QUERY)
  })

  it('normalizes external open state when the viewport changes to desktop', () => {
    const { onOpenChange } = renderDrawer({ open: true })

    expect(screen.getByTestId('drawer-root').getAttribute('data-open')).toBe(
      'true'
    )

    act(() => desktopMedia.setMatches(true))

    expect(screen.getByTestId('drawer-root').getAttribute('data-open')).toBe(
      'false'
    )
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('removes the desktop media-query listener on unmount', () => {
    const { unmount } = renderDrawer()
    const listener = desktopMedia.addEventListener.mock.calls[0]?.[1]

    expect(listener).toEqual(expect.any(Function))

    unmount()

    expect(desktopMedia.removeEventListener).toHaveBeenCalledWith(
      'change',
      listener
    )
  })

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
    const frames = installAnimationFrame()
    const onOpenChange = vi.fn(() => calls.push('close'))
    const onSelect = vi.fn(() => calls.push('select'))
    renderDrawer({ open: true, onOpenChange, onSelect })

    await user.click(
      screen.getByRole('button', { name: 'Infrastructure，12 个书签' })
    )

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSelect).not.toHaveBeenCalled()
    expect(calls).toEqual(['close'])

    frames.run(1)

    expect(onSelect).toHaveBeenCalledWith('infrastructure')
    expect(calls).toEqual(['close', 'select'])
  })

  it('cancels the prior selection frame when selection repeats', async () => {
    const user = userEvent.setup()
    const frames = installAnimationFrame()
    const { onSelect } = renderDrawer({ open: true })
    const enabled = screen.getByRole('button', {
      name: 'Infrastructure，12 个书签',
    })

    await user.click(enabled)
    await user.click(enabled)

    expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(2)
    expect(frames.cancelAnimationFrame).toHaveBeenCalledWith(1)

    frames.run(1)
    frames.run(2)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('infrastructure')
  })

  it('cancels a pending selection frame on unmount', async () => {
    const user = userEvent.setup()
    const frames = installAnimationFrame()
    const { onSelect, unmount } = renderDrawer({ open: true })

    await user.click(
      screen.getByRole('button', { name: 'Infrastructure，12 个书签' })
    )
    unmount()
    frames.run(1)

    expect(frames.cancelAnimationFrame).toHaveBeenCalledWith(1)
    expect(onSelect).not.toHaveBeenCalled()
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
    expect(edge.className).toContain('pointer-events-none')

    fireEvent.pointerDown(window, {
      pointerId: 7,
      pointerType: 'touch',
      clientX: 0,
      clientY: 100,
    })
    fireEvent.pointerMove(window, {
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
      start: [20, 100],
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
    {
      name: 'touch starting outside the edge',
      pointerType: 'touch',
      start: [21, 100],
      end: [80, 100],
    },
  ])('ignores a $name', ({ pointerType, start, end }) => {
    const { onOpenChange } = renderDrawer()

    fireEvent.pointerDown(window, {
      pointerId: 3,
      pointerType,
      clientX: start[0],
      clientY: start[1],
    })
    fireEvent.pointerMove(window, {
      pointerId: 3,
      pointerType,
      clientX: end[0],
      clientY: end[1],
    })
    fireEvent.pointerUp(window, {
      pointerId: 3,
      pointerType,
      clientX: end[0],
      clientY: end[1],
    })

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it.each(['pointerup', 'pointercancel', 'blur'] as const)(
    'resets a pending edge swipe on %s',
    (resetEvent) => {
      const { onOpenChange } = renderDrawer()

      fireEvent.pointerDown(window, {
        pointerId: 5,
        pointerType: 'touch',
        clientX: 0,
        clientY: 100,
      })
      if (resetEvent === 'blur') {
        fireEvent.blur(window)
      } else {
        fireEvent[resetEvent === 'pointerup' ? 'pointerUp' : 'pointerCancel'](
          window,
          {
            pointerId: 5,
            pointerType: 'touch',
            clientX: 10,
            clientY: 100,
          }
        )
      }
      fireEvent.pointerMove(window, {
        pointerId: 5,
        pointerType: 'touch',
        clientX: 60,
        clientY: 100,
      })

      expect(onOpenChange).not.toHaveBeenCalled()
    }
  )

  it('clears stale gesture state whenever open state changes', () => {
    const { onOpenChange, rerenderDrawer } = renderDrawer()

    fireEvent.pointerDown(window, {
      pointerId: 8,
      pointerType: 'touch',
      clientX: 0,
      clientY: 100,
    })
    rerenderDrawer({ open: true })
    rerenderDrawer({ open: false })
    fireEvent.pointerMove(window, {
      pointerId: 8,
      pointerType: 'touch',
      clientX: 60,
      clientY: 100,
    })

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('clears stale gesture state whenever desktop state changes', () => {
    const { onOpenChange } = renderDrawer()

    fireEvent.pointerDown(window, {
      pointerId: 9,
      pointerType: 'touch',
      clientX: 0,
      clientY: 100,
    })
    act(() => desktopMedia.setMatches(true))
    act(() => desktopMedia.setMatches(false))
    fireEvent.pointerMove(window, {
      pointerId: 9,
      pointerType: 'touch',
      clientX: 60,
      clientY: 100,
    })

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('removes every window gesture listener on cleanup', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderDrawer()
    const eventTypes = [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'blur',
    ] as const
    const listeners = eventTypes.map((eventType) => ({
      eventType,
      listener: addEventListener.mock.calls.find(
        ([registeredType]) => registeredType === eventType
      )?.[1],
    }))

    for (const { listener } of listeners) {
      expect(listener).toEqual(expect.any(Function))
    }

    unmount()

    for (const { eventType, listener } of listeners) {
      expect(removeEventListener).toHaveBeenCalledWith(eventType, listener)
    }
  })
})
