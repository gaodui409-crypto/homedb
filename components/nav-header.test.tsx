// @vitest-environment jsdom

import { createRef, type RefObject } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NavHeader } from './nav-header'

type HeaderProps = React.ComponentProps<typeof NavHeader>
type HeaderBaseProps = Omit<
  HeaderProps,
  'navigationOpen' | 'onNavigationOpenChange' | 'navigationTriggerRef'
>
type HalfControlledConfigsAreInvalid = [
  HeaderBaseProps & { navigationOpen: boolean },
  HeaderBaseProps & { onNavigationOpenChange: (open: boolean) => void },
  HeaderBaseProps & {
    navigationTriggerRef: RefObject<HTMLButtonElement | null>
  },
] extends infer Configs
  ? Configs extends readonly [infer OpenOnly, infer ChangeOnly, infer RefOnly]
    ? [
        OpenOnly extends HeaderProps ? false : true,
        ChangeOnly extends HeaderProps ? false : true,
        RefOnly extends HeaderProps ? false : true,
      ]
    : never
  : never

const halfControlledConfigsAreInvalid: HalfControlledConfigsAreInvalid = [
  true,
  true,
  true,
]

interface NavigationOverrides {
  adminMode?: boolean
  theme?: HeaderProps['theme']
  navigationOpen?: boolean
  onNavigationOpenChange?: (open: boolean) => void
  navigationTriggerRef?: RefObject<HTMLButtonElement | null>
  searchQuery?: string
  onSearchChange?: (query: string) => void
  onThemeChange?: (theme: 'light' | 'sepia' | 'dark') => void
}

function renderHeader(overrides: NavigationOverrides = {}) {
  const navigationOpen = overrides.navigationOpen ?? false
  const onNavigationOpenChange =
    overrides.onNavigationOpenChange ?? vi.fn()
  const navigationTriggerRef =
    overrides.navigationTriggerRef ?? createRef<HTMLButtonElement>()
  const onSearchChange = overrides.onSearchChange ?? vi.fn()
  const result = render(
    <NavHeader
      title="HomeDB"
      theme={overrides.theme ?? 'light'}
      adminMode={overrides.adminMode ?? false}
      searchQuery={overrides.searchQuery ?? ''}
      onSearchChange={onSearchChange}
      onThemeChange={overrides.onThemeChange ?? vi.fn()}
      onTitleChange={vi.fn()}
      onAdminToggle={vi.fn()}
      onAddGroup={vi.fn()}
      onExport={vi.fn()}
      onImportFile={vi.fn()}
      onOpenBackground={vi.fn()}
      navigationOpen={navigationOpen}
      onNavigationOpenChange={onNavigationOpenChange}
      navigationTriggerRef={navigationTriggerRef}
    />
  )

  return {
    ...result,
    navigationTriggerRef,
    onNavigationOpenChange,
    onSearchChange,
  }
}

function renderImportHeader(onImportFile = vi.fn()) {
  const result = render(
    <NavHeader
      title="HomeDB"
      theme="light"
      adminMode
      searchQuery=""
      onSearchChange={vi.fn()}
      onThemeChange={vi.fn()}
      onTitleChange={vi.fn()}
      onAdminToggle={vi.fn()}
      onAddGroup={vi.fn()}
      onExport={vi.fn()}
      onImportFile={onImportFile}
      onOpenBackground={vi.fn()}
    />
  )
  const input = result.container.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('Import file input not found')

  return { ...result, input, onImportFile }
}

afterEach(cleanup)

describe('NavHeader mobile navigation trigger', () => {
  it('requires the complete navigation control contract at the type level', () => {
    expect(halfControlledConfigsAreInvalid).toEqual([true, true, true])
  })

  it('renders before the title, reflects expanded state, and opens navigation', async () => {
    const user = userEvent.setup()
    const { rerender, navigationTriggerRef, onNavigationOpenChange } = renderHeader({
      navigationOpen: false,
    })
    const button = screen.getByRole('button', { name: '打开分组导航' })
    const heading = screen.getByRole('heading', { name: 'HomeDB' })

    expect(button.className).toContain('size-8')
    expect(button.className).toContain('rounded-[8px]')
    expect(button.className).toContain('lg:hidden')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(navigationTriggerRef.current).toBe(button)
    expect(
      button.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    await user.click(button)

    expect(onNavigationOpenChange).toHaveBeenCalledWith(true)

    rerender(
      <NavHeader
        title="HomeDB"
        theme="light"
        adminMode={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        navigationOpen
        onNavigationOpenChange={onNavigationOpenChange}
        navigationTriggerRef={navigationTriggerRef}
        onThemeChange={vi.fn()}
        onTitleChange={vi.fn()}
        onAdminToggle={vi.fn()}
        onAddGroup={vi.fn()}
        onExport={vi.fn()}
        onImportFile={vi.fn()}
        onOpenBackground={vi.fn()}
      />
    )

    expect(
      screen
        .getByRole('button', { name: '打开分组导航' })
        .getAttribute('aria-expanded')
    ).toBe('true')
  })

  it('does not render a dead navigation button without the callback', () => {
    render(
      <NavHeader
        title="HomeDB"
        theme="light"
        adminMode={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        onThemeChange={vi.fn()}
        onTitleChange={vi.fn()}
        onAdminToggle={vi.fn()}
        onAddGroup={vi.fn()}
        onExport={vi.fn()}
        onImportFile={vi.fn()}
        onOpenBackground={vi.fn()}
      />
    )

    expect(
      screen.queryByRole('button', { name: '打开分组导航' })
    ).toBeNull()
  })
})

describe('NavHeader branding', () => {
  it('renders the MiniNav icon beside the page title', () => {
    renderHeader()

    const icon = screen.getByRole('img', { name: 'MiniNav' })
    const heading = screen.getByRole('heading', { name: 'HomeDB' })

    expect(icon.getAttribute('src')).toContain('mininav-icon.png')
    expect(icon.style.width).toBe('22px')
    expect(icon.style.height).toBe('22px')
    expect(
      icon.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('keeps the title and its edit command out of the compact mobile row', () => {
    renderHeader({ adminMode: true })

    expect(screen.getByRole('heading', { name: 'HomeDB' }).className).toContain('sr-only')
    const editTitle = screen.getByRole('button', { name: '编辑标题' })
    expect(editTitle.className).toContain('hidden')
    expect(editTitle.className).toContain('sm:flex')
  })
})

describe('NavHeader theme controls', () => {
  it('keeps the segmented picker for desktop and uses one compact mobile control', async () => {
    const user = userEvent.setup()
    const onThemeChange = vi.fn()
    renderHeader({ onThemeChange })

    expect(screen.getByTestId('desktop-theme-switcher').className).toContain('hidden')
    expect(screen.getByTestId('desktop-theme-switcher').className).toContain('sm:flex')

    const mobileThemeButton = screen.getByRole('button', {
      name: '切换主题，当前日间模式',
    })
    expect(mobileThemeButton.className).toContain('sm:hidden')

    await user.click(mobileThemeButton)

    expect(onThemeChange).toHaveBeenCalledWith('sepia')
  })

  it('falls back to the light theme when persisted input is invalid', async () => {
    const user = userEvent.setup()
    const onThemeChange = vi.fn()
    renderHeader({
      theme: 'corrupted' as HeaderProps['theme'],
      onThemeChange,
    })

    expect(screen.getByRole('button', { name: '日间模式' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', {
      name: '切换主题，当前日间模式',
    }))

    expect(onThemeChange).toHaveBeenCalledWith('sepia')
  })
})

describe('NavHeader search', () => {
  it('keeps desktop search controlled and exposes a clear command', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    renderHeader({ searchQuery: 'vps', onSearchChange })

    const search = screen.getByRole('searchbox', { name: '搜索书签' })
    expect(search.getAttribute('value')).toBe('vps')

    fireEvent.change(search, { target: { value: 'nas' } })
    expect(onSearchChange).toHaveBeenCalledWith('nas')

    await user.click(screen.getByRole('button', { name: '清除搜索' }))
    expect(onSearchChange).toHaveBeenLastCalledWith('')
  })

  it('opens mobile search without adding another navigation row and closes on Escape', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    const { container } = renderHeader({ searchQuery: 'vps', onSearchChange })

    await user.click(screen.getByRole('button', { name: '打开搜索' }))

    const mobileSearch = screen.getByRole('searchbox', {
      name: '手机搜索书签',
    })
    expect(mobileSearch.closest('[data-mobile-search]')).toBeTruthy()
    expect(container.querySelector('[data-search-row]')).toBeNull()

    await user.keyboard('{Escape}')

    expect(onSearchChange).toHaveBeenLastCalledWith('')
    expect(
      screen.queryByRole('searchbox', { name: '手机搜索书签' })
    ).toBeNull()
  })
})

describe('NavHeader data import', () => {
  it('imports an old export containing a builtin icon marker', async () => {
    const user = userEvent.setup()
    const { input, onImportFile } = renderImportHeader()
    const file = new File([
      JSON.stringify({
        groups: [{
          name: 'Servers',
          bookmarks: [{
            name: 'Legacy server',
            url: 'https://example.com',
            icon: 'builtin:server',
          }],
        }],
      }),
    ], 'old-export.json', { type: 'application/json' })

    await user.upload(input, file)

    expect(onImportFile).toHaveBeenCalledWith(
      expect.objectContaining({
        groups: [expect.objectContaining({
          bookmarks: [expect.objectContaining({ icon: 'builtin:server' })],
        })],
      }),
      'old-export.json'
    )
  })

  it('distinguishes incompatible data from invalid JSON syntax', async () => {
    const user = userEvent.setup()
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const { input } = renderImportHeader()

    await user.upload(input, new File([
      JSON.stringify({
        groups: [{
          name: 'Unsafe',
          bookmarks: [{ name: 'Script', url: 'javascript:alert(1)' }],
        }],
      }),
    ], 'incompatible.json', { type: 'application/json' }))

    expect(alertSpy).toHaveBeenCalledWith('JSON 数据内容不兼容，请检查分组、书签和网址字段。')
  })
})
