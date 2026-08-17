// @vitest-environment jsdom

import { useRef, useState } from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import type { SidebarItem } from '@/lib/sidebar-navigation'
import { MobileGroupDrawer } from './group-sidebar'

const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)'
const items: SidebarItem[] = [
  {
    id: 'infrastructure',
    name: 'Infrastructure',
    color: '#3B82F6',
    count: 12,
    disabled: false,
  },
]

const pointerCaptureDescriptors = {
  set: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'setPointerCapture'
  ),
  release: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'releasePointerCapture'
  ),
  has: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'hasPointerCapture'
  ),
  scrollIntoView: Object.getOwnPropertyDescriptor(
    Element.prototype,
    'scrollIntoView'
  ),
}

function defineMethod(
  prototype: object,
  name: string,
  value: (...args: never[]) => unknown
) {
  Object.defineProperty(prototype, name, {
    configurable: true,
    value,
  })
}

function restoreMethod(
  prototype: object,
  name: string,
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) Object.defineProperty(prototype, name, descriptor)
  else delete (prototype as Record<string, unknown>)[name]
}

function installMatchMedia(initialMatches = false) {
  let matches = initialMatches
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mediaQueryList = {
    get matches() {
      return matches
    },
    media: DESKTOP_MEDIA_QUERY,
    onchange: null,
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject
    ) {
      if (type === 'change' && typeof listener === 'function') {
        listeners.add(listener as (event: MediaQueryListEvent) => void)
      }
    },
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject
    ) {
      if (type === 'change' && typeof listener === 'function') {
        listeners.delete(listener as (event: MediaQueryListEvent) => void)
      }
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList

  vi.stubGlobal('matchMedia', vi.fn(() => mediaQueryList))

  return {
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

interface ControlledDrawerProps {
  initialOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

function ControlledDrawer({
  initialOpen = false,
  onOpenChange = () => {},
}: ControlledDrawerProps) {
  const [open, setOpen] = useState(initialOpen)
  const triggerRef = useRef<HTMLButtonElement>(null)

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    setOpen(nextOpen)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
      >
        打开真实分组导航
      </button>
      <MobileGroupDrawer
        items={items}
        activeGroupId={null}
        open={open}
        onOpenChange={handleOpenChange}
        onSelect={vi.fn()}
        triggerRef={triggerRef}
      />
    </>
  )
}

let desktopMedia: ReturnType<typeof installMatchMedia>

beforeAll(() => {
  defineMethod(HTMLElement.prototype, 'setPointerCapture', vi.fn())
  defineMethod(HTMLElement.prototype, 'releasePointerCapture', vi.fn())
  defineMethod(HTMLElement.prototype, 'hasPointerCapture', vi.fn(() => false))
  defineMethod(Element.prototype, 'scrollIntoView', vi.fn())
})

afterAll(() => {
  restoreMethod(
    HTMLElement.prototype,
    'setPointerCapture',
    pointerCaptureDescriptors.set
  )
  restoreMethod(
    HTMLElement.prototype,
    'releasePointerCapture',
    pointerCaptureDescriptors.release
  )
  restoreMethod(
    HTMLElement.prototype,
    'hasPointerCapture',
    pointerCaptureDescriptors.has
  )
  restoreMethod(
    Element.prototype,
    'scrollIntoView',
    pointerCaptureDescriptors.scrollIntoView
  )
})

beforeEach(() => {
  vi.stubGlobal('CSS', {
    escape(value: string) {
      return value
    },
  })
  vi.stubGlobal(
    'AnimationEvent',
    class AnimationEvent extends Event {
      readonly animationName: string
      readonly elapsedTime: number
      readonly pseudoElement: string

      constructor(type: string, init: AnimationEventInit = {}) {
        super(type, init)
        this.animationName = init.animationName ?? ''
        this.elapsedTime = init.elapsedTime ?? 0
        this.pseudoElement = init.pseudoElement ?? ''
      }
    }
  )
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
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal(
    'requestAnimationFrame',
    (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
  )
  vi.stubGlobal('cancelAnimationFrame', (frameId: number) => {
    window.clearTimeout(frameId)
  })
  desktopMedia = installMatchMedia()
  document.body.removeAttribute('data-scroll-locked')
})

afterEach(() => {
  cleanup()
  document.body.removeAttribute('data-scroll-locked')
  document.body.style.pointerEvents = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('MobileGroupDrawer with real Vaul primitives', () => {
  it('autofocuses drawer controls and restores trigger focus after Escape', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<ControlledDrawer onOpenChange={onOpenChange} />)
    const trigger = screen.getByText('打开真实分组导航').closest(
      'button'
    ) as HTMLButtonElement

    await user.click(trigger)

    const closeButton = await screen.findByRole('button', {
      name: '关闭分组导航',
    })
    await waitFor(() => expect(document.activeElement).toBe(closeButton))

    await user.keyboard('{Escape}')

    expect(onOpenChange).toHaveBeenCalledWith(false)
    fireEvent.animationEnd(
      document.querySelector('[data-slot="drawer-content"]') as HTMLElement,
      { animationName: 'slideToLeft' }
    )
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('provides an explicit close button and restores trigger focus', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<ControlledDrawer initialOpen onOpenChange={onOpenChange} />)
    const trigger = screen.getByText('打开真实分组导航').closest(
      'button'
    ) as HTMLButtonElement
    const closeButton = await screen.findByRole('button', {
      name: '关闭分组导航',
    })
    const content = document.querySelector(
      '[data-slot="drawer-content"]'
    ) as HTMLElement
    content.style.transform = 'matrix(1, 0, 0, 1, 0, 0)'

    await user.click(closeButton)

    expect(onOpenChange).toHaveBeenCalledWith(false)
    fireEvent.animationEnd(
      document.querySelector('[data-slot="drawer-content"]') as HTMLElement,
      { animationName: 'slideToLeft' }
    )
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('closes after a leftward pointer swipe', async () => {
    const onOpenChange = vi.fn()
    render(<ControlledDrawer initialOpen onOpenChange={onOpenChange} />)

    const content = await waitFor(() => {
      const element = document.querySelector(
        '[data-slot="drawer-content"]'
      ) as HTMLElement | null
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
      bottom: 844,
      height: 844,
      left: 0,
      right: 320,
      top: 0,
      width: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    content.style.transform = 'matrix(1, 0, 0, 1, 0, 0)'

    fireEvent.pointerDown(content, {
      clientX: 280,
      clientY: 300,
      pointerId: 1,
      pointerType: 'touch',
    })
    fireEvent.pointerMove(content, {
      clientX: 40,
      clientY: 302,
      pointerId: 1,
      pointerType: 'touch',
    })
    expect(content.classList).toContain('vaul-dragging')
    // Browsers expose the computed translate3d as a matrix; jsdom does not.
    content.style.transform = 'matrix(1, 0, 0, 1, -240, 0)'
    fireEvent.pointerUp(content, {
      clientX: 40,
      clientY: 302,
      pointerId: 1,
      pointerType: 'touch',
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250))
    })
  })

  it('removes real drawer content and overlay after an overlay close', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<ControlledDrawer initialOpen onOpenChange={onOpenChange} />)

    const content = await waitFor(() => {
      const element = document.querySelector(
        '[data-slot="drawer-content"]'
      ) as HTMLElement | null
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    const overlay = document.querySelector(
      '[data-slot="drawer-overlay"]'
    ) as HTMLElement

    await user.click(overlay)

    expect(onOpenChange).toHaveBeenCalledWith(false)
    fireEvent.animationEnd(content, { animationName: 'slideToLeft' })
    fireEvent.animationEnd(overlay, { animationName: 'fadeOut' })
    await waitFor(() => {
      expect(document.querySelector('[data-slot="drawer-content"]')).toBeNull()
      expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeNull()
      expect(document.body.getAttribute('data-scroll-locked')).toBeNull()
    })
  })

  it('closes and cleans up the real drawer when switching to desktop', async () => {
    const onOpenChange = vi.fn()
    render(<ControlledDrawer initialOpen onOpenChange={onOpenChange} />)

    const content = await waitFor(() => {
      const element = document.querySelector(
        '[data-slot="drawer-content"]'
      ) as HTMLElement | null
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    const overlay = document.querySelector(
      '[data-slot="drawer-overlay"]'
    ) as HTMLElement

    act(() => desktopMedia.setMatches(true))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    fireEvent.animationEnd(content, { animationName: 'slideToLeft' })
    fireEvent.animationEnd(overlay, { animationName: 'fadeOut' })

    await waitFor(() => {
      expect(document.querySelector('[data-slot="drawer-content"]')).toBeNull()
      expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeNull()
      expect(document.body.getAttribute('data-scroll-locked')).toBeNull()
    })
  })

  it('locks body scroll while open and removes the lock on unmount', async () => {
    const { unmount } = render(<ControlledDrawer initialOpen />)

    await waitFor(() =>
      expect(document.body.getAttribute('data-scroll-locked')).toBe('1')
    )

    unmount()

    await waitFor(() =>
      expect(document.body.getAttribute('data-scroll-locked')).toBeNull()
    )
  })
})
