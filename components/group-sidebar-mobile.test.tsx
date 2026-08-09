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
  DrawerClose: ({ children }: { children: ReactNode }) => children,
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

interface TestTouchPoint {
  identifier: number
  clientX: number
  clientY: number
}

function touch(
  identifier: number,
  clientX: number,
  clientY: number
): TestTouchPoint {
  return { identifier, clientX, clientY }
}

function dispatchTouchEvent(
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  touches: TestTouchPoint[],
  changedTouches = touches
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    touches: { configurable: true, value: touches },
    changedTouches: { configurable: true, value: changedTouches },
  })

  act(() => window.dispatchEvent(event))
  return event
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

  it('does not restore focus to the hidden trigger after switching to desktop', () => {
    const triggerRef = createRef<HTMLButtonElement>()
    render(<button ref={triggerRef}>Navigation trigger</button>)
    renderDrawer({ open: true, triggerRef })
    const closeAutoFocus = drawerMockState.onCloseAutoFocus
    const focus = vi.spyOn(triggerRef.current as HTMLButtonElement, 'focus')
    const preventDefault = vi.fn()

    act(() => desktopMedia.setMatches(true))
    act(() => closeAutoFocus?.({ preventDefault }))

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(focus).not.toHaveBeenCalled()
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
    expect(content?.className).not.toContain('lg:hidden')
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
    expect(edge.className).toContain('lg:hidden')
    expect(edge.className).toContain('pointer-events-none')

    dispatchTouchEvent('touchstart', [touch(7, 0, 100)])
    const intentMove = dispatchTouchEvent('touchmove', [touch(7, 10, 101)])
    const thresholdMove = dispatchTouchEvent('touchmove', [
      touch(7, 48, 132),
    ])

    expect(intentMove.defaultPrevented).toBe(false)
    expect(thresholdMove.defaultPrevented).toBe(true)
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('ignores edge swipes that begin inside the sticky header', () => {
    const { onOpenChange } = renderDrawer()

    dispatchTouchEvent('touchstart', [touch(10, 0, 40)])
    const move = dispatchTouchEvent('touchmove', [touch(10, 60, 40)])

    expect(move.defaultPrevented).toBe(false)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('releases a gesture when vertical movement overtakes a small rightward jitter', () => {
    const { onOpenChange } = renderDrawer()

    dispatchTouchEvent('touchstart', [touch(11, 0, 100)])
    const jitter = dispatchTouchEvent('touchmove', [touch(11, 10, 101)])
    const verticalMove = dispatchTouchEvent('touchmove', [touch(11, 11, 120)])
    const laterMove = dispatchTouchEvent('touchmove', [touch(11, 60, 120)])

    expect(jitter.defaultPrevented).toBe(false)
    expect(verticalMove.defaultPrevented).toBe(false)
    expect(laterMove.defaultPrevented).toBe(false)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('registers touch movement as non-passive', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')

    renderDrawer()

    const touchMoveCall = addEventListener.mock.calls.find(
      ([eventType]) => eventType === 'touchmove'
    )
    expect(touchMoveCall?.[1]).toEqual(expect.any(Function))
    expect(touchMoveCall?.[2]).toEqual(
      expect.objectContaining({ passive: false })
    )
  })

  it.each([
    {
      name: 'short swipe',
      start: [0, 100],
      end: [47, 100],
    },
    {
      name: 'leftward swipe',
      start: [20, 100],
      end: [0, 100],
    },
    {
      name: 'swipe with excessive vertical drift',
      start: [0, 100],
      end: [60, 133],
    },
  ])('ignores a $name', ({ start, end }) => {
    const { onOpenChange } = renderDrawer()

    dispatchTouchEvent('touchstart', [touch(3, start[0], start[1])])
    dispatchTouchEvent('touchmove', [touch(3, end[0], end[1])])
    dispatchTouchEvent('touchend', [], [touch(3, end[0], end[1])])

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('abandons vertical scrolling without preventing it', () => {
    const { onOpenChange } = renderDrawer()

    dispatchTouchEvent('touchstart', [touch(4, 0, 100)])
    const verticalMove = dispatchTouchEvent('touchmove', [
      touch(4, 4, 112),
    ])
    const laterMove = dispatchTouchEvent('touchmove', [touch(4, 60, 112)])

    expect(verticalMove.defaultPrevented).toBe(false)
    expect(laterMove.defaultPrevented).toBe(false)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('ignores touches starting outside the edge without preventing them', () => {
    const { onOpenChange } = renderDrawer()

    dispatchTouchEvent('touchstart', [touch(6, 21, 100)])
    const move = dispatchTouchEvent('touchmove', [touch(6, 80, 100)])

    expect(move.defaultPrevented).toBe(false)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it.each(['touchend', 'touchcancel', 'blur'] as const)(
    'resets a pending edge swipe on %s',
    (resetEvent) => {
      const { onOpenChange } = renderDrawer()

      dispatchTouchEvent('touchstart', [touch(5, 0, 100)])
      if (resetEvent === 'blur') {
        fireEvent.blur(window)
      } else {
        dispatchTouchEvent(
          resetEvent,
          [],
          [touch(5, 10, 100)]
        )
      }
      dispatchTouchEvent('touchmove', [touch(5, 60, 100)])

      expect(onOpenChange).not.toHaveBeenCalled()
    }
  )

  it('clears stale gesture state whenever open state changes', () => {
    const { onOpenChange, rerenderDrawer } = renderDrawer()

    dispatchTouchEvent('touchstart', [touch(8, 0, 100)])
    rerenderDrawer({ open: true })
    rerenderDrawer({ open: false })
    dispatchTouchEvent('touchmove', [touch(8, 60, 100)])

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('clears stale gesture state whenever desktop state changes', () => {
    const { onOpenChange } = renderDrawer()

    dispatchTouchEvent('touchstart', [touch(9, 0, 100)])
    act(() => desktopMedia.setMatches(true))
    act(() => desktopMedia.setMatches(false))
    dispatchTouchEvent('touchmove', [touch(9, 60, 100)])

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('removes every window gesture listener on cleanup', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderDrawer()
    const touchEventTypes = [
      'touchstart',
      'touchmove',
      'touchend',
      'touchcancel',
    ] as const
    const touchListeners = touchEventTypes.map((eventType) => ({
      eventType,
      registration: addEventListener.mock.calls.find(
        ([registeredType]) => registeredType === eventType
      ),
    }))
    const blurListener = addEventListener.mock.calls.find(
      ([registeredType]) => registeredType === 'blur'
    )?.[1]

    for (const { registration } of touchListeners) {
      expect(registration?.[1]).toEqual(expect.any(Function))
      expect(registration?.[2]).toEqual(
        expect.objectContaining({ passive: false })
      )
    }
    expect(blurListener).toEqual(expect.any(Function))

    unmount()

    for (const { eventType, registration } of touchListeners) {
      expect(removeEventListener).toHaveBeenCalledWith(
        eventType,
        registration?.[1],
        registration?.[2]
      )
    }
    expect(removeEventListener).toHaveBeenCalledWith('blur', blurListener)
  })
})
