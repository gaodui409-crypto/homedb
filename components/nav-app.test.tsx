// @vitest-environment jsdom

import type { ComponentProps, Ref } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NavApp } from './nav-app'
import type { SortableGroup } from './bookmark-group'
import type { DesktopGroupSidebar, MobileGroupDrawer } from './group-sidebar'
import type { NavHeader } from './nav-header'
import type { QuickBar } from './quick-bar'
import type { Group } from '@/lib/types'

const appMocks = vi.hoisted(() => ({
  clearToken: vi.fn(),
  desktopProps: [] as unknown[],
  dndContextProps: [] as unknown[],
  headerProps: [] as unknown[],
  mobileProps: [] as unknown[],
  quickBarProps: [] as unknown[],
  setActiveGroupId: vi.fn(),
  stickyAnchorTop: 144,
  sortableContextProps: [] as unknown[],
  sortableGroupProps: [] as unknown[],
  useActiveGroupIds: [] as string[][],
  useNavStore: vi.fn(),
}))

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView'
)

vi.mock('@/lib/use-nav-store', () => ({
  clearToken: appMocks.clearToken,
  useNavStore: appMocks.useNavStore,
}))

vi.mock('@/hooks/use-active-group', () => ({
  useActiveGroup: (ids: string[]) => {
    appMocks.useActiveGroupIds.push(ids)
    return {
      activeGroupId: null,
      setActiveGroupId: appMocks.setActiveGroupId,
      stickyAnchorTop: appMocks.stickyAnchorTop,
    }
  },
}))

vi.mock('@/components/nav-header', () => ({
  NavHeader: (props: Record<string, unknown>) => {
    appMocks.headerProps.push(props)
    return (
      <button
        ref={props.navigationTriggerRef as Ref<HTMLButtonElement>}
        type="button"
        data-testid="header-navigation-trigger"
        data-open={String(props.navigationOpen)}
        onClick={() =>
          (props.onNavigationOpenChange as (open: boolean) => void)?.(true)
        }
      >
        Open navigation
      </button>
    )
  },
}))

vi.mock('@/components/quick-bar', () => ({
  QuickBar: (props: Record<string, unknown>) => {
    appMocks.quickBarProps.push(props)
    return (
      <input
        aria-label="测试搜索"
        value={props.searchQuery as string}
        onChange={(event) =>
          (props.onSearchChange as (query: string) => void)(event.target.value)
        }
      />
    )
  },
}))

vi.mock('@/components/group-sidebar', () => ({
  DesktopGroupSidebar: (props: Record<string, unknown>) => {
    appMocks.desktopProps.push(props)
    const items = props.items as Array<{ id: string; disabled: boolean }>
    return (
      <aside data-testid="desktop-sidebar">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`desktop-select-${item.id}`}
            disabled={item.disabled}
            onClick={() => (props.onSelect as (id: string) => void)(item.id)}
          >
            {item.id}
          </button>
        ))}
      </aside>
    )
  },
  MobileGroupDrawer: (props: Record<string, unknown>) => {
    appMocks.mobileProps.push(props)
    const items = props.items as Array<{ id: string; disabled: boolean }>
    return (
      <aside data-testid="mobile-drawer" data-open={String(props.open)}>
        <button
          type="button"
          data-testid="mobile-close"
          onClick={() => (props.onOpenChange as (open: boolean) => void)(false)}
        >
          Close navigation
        </button>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`mobile-select-${item.id}`}
            disabled={item.disabled}
            onClick={() => (props.onSelect as (id: string) => void)(item.id)}
          >
            {item.id}
          </button>
        ))}
      </aside>
    )
  },
}))

vi.mock('@/components/bookmark-group', () => ({
  SortableGroup: (props: Record<string, unknown>) => {
    appMocks.sortableGroupProps.push(props)
    const group = props.group as Group
    return (
      <section id={`group-${group.id}`} data-group-id={group.id}>
        {group.name}
      </section>
    )
  },
}))

vi.mock('@/components/bookmark-card', () => ({
  BookmarkCard: () => <div data-testid="drag-overlay-bookmark" />,
}))

vi.mock('@/components/admin-modals', () => ({
  BookmarkModal: () => null,
  ConfirmDeleteModal: () => null,
  GroupModal: () => null,
  ImportModeModal: () => null,
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: (props: Record<string, unknown>) => {
    appMocks.dndContextProps.push(props)
    return props.children
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => children,
  PointerSensor: 'PointerSensor',
  TouchSensor: 'TouchSensor',
  closestCorners: 'closestCorners',
  useSensor: vi.fn((sensor, options) => ({ sensor, options })),
  useSensors: vi.fn((...sensors) => sensors),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: (props: Record<string, unknown>) => {
    appMocks.sortableContextProps.push(props)
    return props.children
  },
  arrayMove: vi.fn((items: unknown[]) => items),
  verticalListSortingStrategy: 'vertical-list-sorting-strategy',
}))

type HeaderProps = ComponentProps<typeof NavHeader>
type QuickBarProps = ComponentProps<typeof QuickBar>
type DesktopProps = ComponentProps<typeof DesktopGroupSidebar>
type MobileProps = ComponentProps<typeof MobileGroupDrawer>
type SortableGroupProps = ComponentProps<typeof SortableGroup>

const groups: Group[] = [
  {
    id: 'later',
    name: 'Later',
    order: 2,
    color: '#10B981',
    bookmarks: [
      {
        id: 'alpha-url',
        name: 'Docs',
        url: 'https://ALPHA.example/docs',
        order: 0,
        pinned: true,
      },
      {
        id: 'gamma-name',
        name: 'Gamma Console',
        url: 'https://gamma.example',
        order: 1,
      },
    ],
  },
  {
    id: 'first',
    name: 'First',
    order: 1,
    color: '#3B82F6',
    bookmarks: [
      {
        id: 'beta-name',
        name: 'Beta Tool',
        url: 'https://beta.example',
        order: 0,
      },
    ],
  },
]

function createStore(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    groups,
    title: 'HomeDB',
    theme: 'light',
    adminMode: true,
    syncing: false,
    syncError: null,
    setAdminMode: vi.fn(),
    setTheme: vi.fn(),
    setTitle: vi.fn(),
    exportData: vi.fn(),
    addBookmark: vi.fn(),
    updateBookmark: vi.fn(),
    deleteBookmark: vi.fn(),
    togglePinBookmark: vi.fn(),
    moveBookmark: vi.fn(),
    reorderBookmarks: vi.fn(),
    addGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    reorderGroups: vi.fn(),
    importData: vi.fn(),
    retrySyncToCloud: vi.fn(),
    clearSyncError: vi.fn(),
    ...overrides,
  }
}

function latest<T>(values: unknown[]): T {
  return values[values.length - 1] as T
}

function resetCapturedProps() {
  appMocks.desktopProps.length = 0
  appMocks.dndContextProps.length = 0
  appMocks.headerProps.length = 0
  appMocks.mobileProps.length = 0
  appMocks.quickBarProps.length = 0
  appMocks.sortableContextProps.length = 0
  appMocks.sortableGroupProps.length = 0
  appMocks.useActiveGroupIds.length = 0
}

beforeEach(() => {
  resetCapturedProps()
  vi.clearAllMocks()
  appMocks.useNavStore.mockReturnValue(createStore())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  if (scrollIntoViewDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollIntoView',
      scrollIntoViewDescriptor
    )
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  }
})

describe('NavApp sidebar integration', () => {
  it('keeps sidebar order fixed while applying normalized search counts and visibility', () => {
    render(<NavApp />)

    expect(latest<DesktopProps>(appMocks.desktopProps).items).toEqual([
      { id: 'first', name: 'First', color: '#3B82F6', count: 1, disabled: false },
      { id: 'later', name: 'Later', color: '#10B981', count: 2, disabled: false },
    ])
    expect(latest<MobileProps>(appMocks.mobileProps).items).toEqual(
      latest<DesktopProps>(appMocks.desktopProps).items
    )
    expect(latest<QuickBarProps>(appMocks.quickBarProps)).not.toHaveProperty('groups')
    expect(appMocks.useActiveGroupIds.at(-1)).toEqual(['first', 'later'])

    expect(latest<Record<string, unknown>>(appMocks.dndContextProps)).toEqual(
      expect.objectContaining({
        onDragStart: expect.any(Function),
        onDragOver: expect.any(Function),
        onDragEnd: expect.any(Function),
      })
    )
    expect(latest<Record<string, unknown>>(appMocks.sortableContextProps)).toEqual(
      expect.objectContaining({
        items: ['first', 'later'],
        strategy: 'vertical-list-sorting-strategy',
      })
    )
    expect(latest<SortableGroupProps>(appMocks.sortableGroupProps)).toEqual(
      expect.objectContaining({
        adminMode: true,
        onAddBookmark: expect.any(Function),
        onEditBookmark: expect.any(Function),
        onDeleteBookmark: expect.any(Function),
        onTogglePin: expect.any(Function),
        onEditGroup: expect.any(Function),
        onDeleteGroup: expect.any(Function),
      })
    )

    fireEvent.change(screen.getByRole('textbox', { name: '测试搜索' }), {
      target: { value: '  ALPHA  ' },
    })

    expect(latest<DesktopProps>(appMocks.desktopProps).items).toEqual([
      { id: 'first', name: 'First', color: '#3B82F6', count: 0, disabled: true },
      { id: 'later', name: 'Later', color: '#10B981', count: 1, disabled: false },
    ])
    expect(latest<MobileProps>(appMocks.mobileProps).items).toEqual(
      latest<DesktopProps>(appMocks.desktopProps).items
    )
    expect(appMocks.useActiveGroupIds.at(-1)).toEqual(['later'])
    expect(document.querySelector('#group-first')).toBeNull()
    expect(document.querySelector('#group-later')).toBeTruthy()
  })

  it('disables sorting while search hides groups or bookmarks', () => {
    const store = createStore()
    appMocks.useNavStore.mockReturnValue(store)
    render(<NavApp />)

    fireEvent.change(screen.getByRole('textbox', { name: '测试搜索' }), {
      target: { value: 'alpha' },
    })

    expect(latest<Record<string, unknown>>(appMocks.sortableContextProps).items).toEqual([
      'later',
    ])
    expect(
      latest<Record<string, unknown>>(appMocks.sortableGroupProps).dragEnabled
    ).toBe(false)

    const groupEvent = {
      active: { id: 'later', data: { current: { type: 'group' } } },
      over: { id: 'first', data: { current: { type: 'group' } } },
    }
    const bookmarkStartEvent = {
      active: {
        id: 'alpha-url',
        data: {
          current: {
            type: 'bookmark',
            bookmark: groups[0].bookmarks[0],
          },
        },
      },
    }

    act(() => {
      latest<Record<string, (event: unknown) => void>>(
        appMocks.dndContextProps
      ).onDragStart(bookmarkStartEvent)
    })

    act(() => {
      latest<Record<string, (event: unknown) => void>>(
        appMocks.dndContextProps
      ).onDragOver({
        active: bookmarkStartEvent.active,
        over: {
          id: 'first',
          data: { current: { type: 'group' } },
        },
      })
      latest<Record<string, (event: unknown) => void>>(
        appMocks.dndContextProps
      ).onDragEnd(groupEvent)
      latest<Record<string, (event: unknown) => void>>(
        appMocks.dndContextProps
      ).onDragEnd({
        active: bookmarkStartEvent.active,
        over: {
          id: 'gamma-name',
          data: {
            current: {
              type: 'bookmark',
              bookmark: groups[0].bookmarks[1],
            },
          },
        },
      })
    })

    expect(store.moveBookmark).not.toHaveBeenCalled()
    expect(store.reorderGroups).not.toHaveBeenCalled()
    expect(store.reorderBookmarks).not.toHaveBeenCalled()
  })

  it('uses normalized emptiness for content empty states and management actions', () => {
    render(<NavApp />)
    const search = screen.getByRole('textbox', { name: '测试搜索' })

    fireEvent.change(search, { target: { value: '   ' } })

    expect(screen.queryByText(/未找到匹配/)).toBeNull()
    expect(screen.getByRole('button', { name: /添加分组/ })).toBeTruthy()
    expect(appMocks.useActiveGroupIds.at(-1)).toEqual(['first', 'later'])

    fireEvent.change(search, { target: { value: 'missing' } })

    expect(screen.getByText(/未找到匹配/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /添加分组/ })).toBeNull()
    expect(latest<DesktopProps>(appMocks.desktopProps).items.every(
      (item) => item.disabled && item.count === 0
    )).toBe(true)
    expect(appMocks.useActiveGroupIds.at(-1)).toEqual([])
  })

  it('treats whitespace as no search when there are no groups', () => {
    appMocks.useNavStore.mockReturnValue(createStore({ groups: [] }))
    render(<NavApp />)

    fireEvent.change(screen.getByRole('textbox', { name: '测试搜索' }), {
      target: { value: '   ' },
    })

    expect(screen.getByText('暂无书签分组')).toBeTruthy()
    expect(screen.queryByText(/未找到匹配/)).toBeNull()
    expect(screen.getByRole('button', { name: '创建第一个分组' })).toBeTruthy()
  })

  it('shares controlled navigation state, trigger ref, and guarded selection behavior', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    render(<NavApp />)

    const initialHeader = latest<HeaderProps>(appMocks.headerProps)
    const initialDesktop = latest<DesktopProps>(appMocks.desktopProps)
    const initialMobile = latest<MobileProps>(appMocks.mobileProps)

    expect(initialHeader.navigationTriggerRef).toBe(initialMobile.triggerRef)
    expect(initialHeader.navigationOpen).toBe(false)
    expect(initialMobile.open).toBe(false)
    expect(initialDesktop.onSelect).toBe(initialMobile.onSelect)

    await user.click(screen.getByTestId('header-navigation-trigger'))

    expect(latest<HeaderProps>(appMocks.headerProps).navigationOpen).toBe(true)
    expect(latest<MobileProps>(appMocks.mobileProps).open).toBe(true)
    expect(latest<HeaderProps>(appMocks.headerProps).navigationTriggerRef).toBe(
      latest<MobileProps>(appMocks.mobileProps).triggerRef
    )

    await user.click(screen.getByTestId('mobile-close'))
    expect(latest<HeaderProps>(appMocks.headerProps).navigationOpen).toBe(false)
    expect(latest<MobileProps>(appMocks.mobileProps).open).toBe(false)

    await user.click(screen.getByTestId('desktop-select-first'))
    expect(appMocks.setActiveGroupId).toHaveBeenCalledTimes(1)
    expect(appMocks.setActiveGroupId).toHaveBeenCalledWith('first')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    })

    expect(document.querySelector('.min-h-screen')?.getAttribute('style')).toContain(
      '--sticky-navigation-offset: 160px'
    )

    document.querySelector('#group-first')?.remove()
    await user.click(screen.getByTestId('mobile-select-first'))

    expect(appMocks.setActiveGroupId).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('uses instant group navigation when reduced motion is requested', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    render(<NavApp />)

    await user.click(screen.getByTestId('desktop-select-first'))

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'start',
    })
  })
})
