// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  SIDEBAR_COLLAPSED_KEY,
  type SidebarItem,
} from '@/lib/sidebar-navigation'
import {
  DesktopGroupSidebar,
  GroupSidebarContent,
  type DesktopGroupSidebarProps,
  type GroupSidebarContentProps,
} from './group-sidebar'

function installRadixTooltipBrowserStubs() {
  // Radix Popper observes portaled tooltip content; jsdom has no layout observer.
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
}

installRadixTooltipBrowserStubs()

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
    name: 'Reference material with a deliberately long group name',
    color: '#10B981',
    count: 0,
    disabled: true,
  },
]

const enabledLabel = 'Infrastructure，12 个书签'
const disabledLabel =
  'Reference material with a deliberately long group name，0 个书签，无匹配结果'

type DesktopOwnsCollapsedState =
  'collapsed' extends keyof DesktopGroupSidebarProps ? false : true

const desktopOwnsCollapsedState: DesktopOwnsCollapsedState = true

function renderContent(overrides: Partial<GroupSidebarContentProps> = {}) {
  const onSelect = overrides.onSelect ?? vi.fn()
  const result = render(
    <GroupSidebarContent
      items={overrides.items ?? items}
      activeGroupId={overrides.activeGroupId ?? null}
      collapsed={overrides.collapsed}
      onSelect={onSelect}
    />
  )

  return { ...result, onSelect }
}

function renderDesktop(overrides: Partial<DesktopGroupSidebarProps> = {}) {
  const onSelect = overrides.onSelect ?? vi.fn()
  const result = render(
    <DesktopGroupSidebar
      items={overrides.items ?? items}
      activeGroupId={overrides.activeGroupId ?? null}
      onSelect={onSelect}
    />
  )

  return { ...result, onSelect }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('GroupSidebarContent', () => {
  it('renders expanded items in input order with counts, swatches, and full names', () => {
    const { container } = renderContent()
    const buttons = screen.getAllByRole('button')
    const swatches = container.querySelectorAll('[aria-hidden="true"]')

    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      enabledLabel,
      disabledLabel,
    ])
    expect(within(buttons[0]).getByText('12')).toBeTruthy()
    expect(within(buttons[1]).getByText('0')).toBeTruthy()
    expect(swatches[0].getAttribute('style')).toContain(
      'background-color: rgb(59, 130, 246)'
    )
    expect(swatches[1].getAttribute('style')).toContain(
      'background-color: rgb(16, 185, 129)'
    )
    expect(
      within(buttons[1])
        .getByText('Reference material with a deliberately long group name')
        .getAttribute('title')
    ).toBe('Reference material with a deliberately long group name')
  })

  it('marks the active item as the current location', () => {
    renderContent({ activeGroupId: 'infrastructure' })

    expect(
      screen
        .getByRole('button', { name: enabledLabel })
        .getAttribute('aria-current')
    ).toBe('location')
  })

  it('selects an enabled collapsed item exactly once without a duplicate tab stop', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderContent({ items: [items[0]], collapsed: true })
    const button = screen.getByRole('button', { name: enabledLabel })

    expect(button.tagName).toBe('BUTTON')
    expect(document.querySelectorAll('[tabindex="0"]')).toHaveLength(0)

    await user.click(button)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('infrastructure')
  })

  it('exposes a disabled collapsed item as one focusable unavailable button', async () => {
    const user = userEvent.setup()
    const { container, onSelect } = renderContent({
      items: [items[1]],
      collapsed: true,
    })
    const trigger = screen.getByRole('button', { name: disabledLabel })

    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger.getAttribute('aria-disabled')).toBe('true')
    expect((trigger as HTMLButtonElement).tabIndex).toBe(0)
    expect(trigger.hasAttribute('title')).toBe(false)
    expect(screen.getAllByRole('button', { name: disabledLabel })).toHaveLength(1)
    expect((trigger as HTMLButtonElement).disabled).toBe(false)
    expect(trigger.querySelector('button')).toBeNull()
    expect(container.querySelectorAll('button[aria-disabled="true"]')).toHaveLength(1)

    await user.tab()

    expect(document.activeElement).toBe(trigger)
    expect((await screen.findByRole('tooltip')).textContent).toBe(disabledLabel)

    await user.click(trigger)

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('uses an explicit eight-pixel radius for item and collapse buttons', () => {
    renderDesktop({ items: [items[0]] })

    expect(screen.getByRole('button', { name: enabledLabel }).className).toContain(
      'rounded-[8px]'
    )
    expect(
      screen.getByRole('button', { name: '收起分组侧边栏' }).className
    ).toContain('rounded-[8px]')
  })

  it('renders a concise empty state only when expanded', () => {
    const { rerender } = render(
      <GroupSidebarContent
        items={[]}
        activeGroupId={null}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('暂无分组')).toBeTruthy()

    rerender(
      <GroupSidebarContent
        items={[]}
        activeGroupId={null}
        collapsed
        onSelect={vi.fn()}
      />
    )

    expect(screen.queryByText('暂无分组')).toBeNull()
  })
})

describe('DesktopGroupSidebar', () => {
  it('owns collapsed state instead of advertising a collapsed prop', () => {
    expect(desktopOwnsCollapsedState).toBe(true)
  })

  it('toggles collapsed UI and persists both collapsed and expanded states', async () => {
    const user = userEvent.setup()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem')
    renderDesktop()

    await user.click(screen.getByRole('button', { name: '收起分组侧边栏' }))

    const expandButton = screen.getByRole('button', { name: '展开分组侧边栏' })
    expect(expandButton.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByLabelText('分组侧边栏').className).toContain('w-14')
    expect(setItem).toHaveBeenCalledWith(SIDEBAR_COLLAPSED_KEY, '1')
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('1')

    await user.click(expandButton)

    expect(
      screen.getByRole('button', { name: '收起分组侧边栏' })
        .getAttribute('aria-expanded')
    ).toBe('true')
    expect(screen.getByLabelText('分组侧边栏').className).toContain('w-[220px]')
    expect(removeItem).toHaveBeenCalledWith(SIDEBAR_COLLAPSED_KEY)
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBeNull()
  })

  it('hydrates the server-safe expanded shell before restoring persisted state', async () => {
    window.localStorage.clear()
    const container = document.createElement('div')
    container.innerHTML = renderToString(
      <DesktopGroupSidebar items={items} activeGroupId={null} onSelect={vi.fn()} />
    )
    document.body.append(container)

    expect(
      within(container).getByRole('button', { name: '收起分组侧边栏' })
    ).toBeTruthy()

    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '1')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const root = hydrateRoot(
      container,
      <DesktopGroupSidebar items={items} activeGroupId={null} onSelect={vi.fn()} />
    )

    await waitFor(() => {
      expect(
        within(container).getByRole('button', { name: '展开分组侧边栏' })
      ).toBeTruthy()
    })
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('Hydration')
    expect(within(container).getByLabelText('分组侧边栏').className).toContain('w-14')
    root.unmount()
  })

  it('keeps the in-memory toggle when storage writes fail', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    renderDesktop()

    await user.click(screen.getByRole('button', { name: '收起分组侧边栏' }))

    expect(screen.getByRole('button', { name: '展开分组侧边栏' })).toBeTruthy()
    expect(screen.getByLabelText('分组侧边栏').className).toContain('w-14')
  })
})
