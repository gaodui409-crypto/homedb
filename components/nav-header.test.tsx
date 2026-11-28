// @vitest-environment jsdom

import { createRef, type RefObject } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MAX_BACKUP_FILE_BYTES, MAX_BACKUP_FILE_MB, navDataSchema } from '@/lib/nav-schema'
import { useNavStore } from '@/lib/use-nav-store'
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

    // Re-open mobile search and close via the left back arrow -> must also clear search query!
    await user.click(screen.getByRole('button', { name: '打开搜索' }))
    onSearchChange.mockClear()
    await user.click(screen.getByRole('button', { name: '关闭搜索' }))
    expect(onSearchChange).toHaveBeenCalledWith('')
    expect(
      screen.queryByRole('searchbox', { name: '手机搜索书签' })
    ).toBeNull()
  })

  it('guards Enter keydown during IME composition so Chinese input confirmation never launches prematurely', () => {
    const onSearchKeyDown = vi.fn()
    render(
      <NavHeader
        title="HomeDB"
        theme="light"
        adminMode={false}
        searchQuery="nei"
        onSearchChange={vi.fn()}
        onSearchKeyDown={onSearchKeyDown}
        onThemeChange={vi.fn()}
        onTitleChange={vi.fn()}
        onAdminToggle={vi.fn()}
        onAddGroup={vi.fn()}
        onExport={vi.fn()}
        onImportFile={vi.fn()}
        onOpenBackground={vi.fn()}
      />
    )

    const search = screen.getByRole('searchbox', { name: '搜索书签' })

    // IME composing Enter (keyCode 229 or isComposing) must be ignored
    fireEvent.keyDown(search, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(search, { key: 'Enter', keyCode: 229 })
    expect(onSearchKeyDown).not.toHaveBeenCalled()

    // Non-composing Enter forwards cleanly
    fireEvent.keyDown(search, { key: 'Enter', isComposing: false, keyCode: 13 })
    expect(onSearchKeyDown).toHaveBeenCalledTimes(1)
  })

  it('HDB-003: exits mobile-only search overlay and restores desktop toolbar while preserving search query when viewport crosses md breakpoint', () => {
    const previousInnerWidth = window.innerWidth
    try {
      Object.defineProperty(window, 'innerWidth', {
        value: 390,
        writable: true,
        configurable: true,
      })
      const onSearchChange = vi.fn()
      const onMobileSearchOpenChange = vi.fn()
      const view = render(
        <NavHeader
          title="HomeDB"
          theme="light"
          adminMode
          searchQuery="vps"
          onSearchChange={onSearchChange}
          onMobileSearchOpenChange={onMobileSearchOpenChange}
          onThemeChange={vi.fn()}
          onTitleChange={vi.fn()}
          onAdminToggle={vi.fn()}
          onAddGroup={vi.fn()}
          onExport={vi.fn()}
          onImportFile={vi.fn()}
          onOpenBackground={vi.fn()}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: '打开搜索' }))
      expect(onMobileSearchOpenChange).toHaveBeenCalledWith(true)

      view.rerender(
        <NavHeader
          title="HomeDB"
          theme="light"
          adminMode
          mobileSearchOpen
          searchQuery="vps"
          onSearchChange={onSearchChange}
          onMobileSearchOpenChange={onMobileSearchOpenChange}
          onThemeChange={vi.fn()}
          onTitleChange={vi.fn()}
          onAdminToggle={vi.fn()}
          onAddGroup={vi.fn()}
          onExport={vi.fn()}
          onImportFile={vi.fn()}
          onOpenBackground={vi.fn()}
        />
      )
      expect(screen.getByRole('searchbox', { name: '手机搜索书签' })).toBeTruthy()

      Object.defineProperty(window, 'innerWidth', {
        value: 1024,
        writable: true,
        configurable: true,
      })
      fireEvent(window, new Event('resize'))

      expect(onMobileSearchOpenChange).toHaveBeenLastCalledWith(false)
      expect(onSearchChange).not.toHaveBeenCalledWith('')
      expect(view.container.querySelector('[data-mobile-search]')).toBeNull()
      expect(
        (screen.getByRole('searchbox', { name: '搜索书签' }) as HTMLInputElement).value
      ).toBe('vps')
      expect(screen.getByRole('button', { name: '退出管理模式' })).toBeTruthy()
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        value: previousInnerWidth,
        writable: true,
        configurable: true,
      })
    }
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

    expect(alertSpy).toHaveBeenCalledWith('书签格式不对，请检查分组名、名称和网址')
    alertSpy.mockRestore()
  })

  it('HDB-002: imports a >1 MB valid backup exported by exportData and still enforces the shared maximum size ceiling', async () => {
    const largeGroups = Array.from({ length: 2 }, (_, g) => ({
      id: `g${g}`,
      name: `Group ${g}`,
      color: '#123456',
      order: g,
      bookmarks: Array.from({ length: 400 }, (_, b) => ({
        id: `g${g}b${b}`,
        name: `Bookmark ${b}`,
        url: 'https://example.test/',
        order: b,
        note: '字'.repeat(500),
      })),
    }))
    expect(navDataSchema.safeParse({ groups: largeGroups }).success).toBe(true)

    localStorage.clear()
    localStorage.setItem('mininav_data', JSON.stringify({ groups: largeGroups }))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ groups: largeGroups, initialized: false, storage: 'local' }),
          { status: 200, headers: { 'X-Nav-Data-Source': 'disabled' } }
        )
      )
    )

    let exportedBlob: Blob | undefined
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      exportedBlob = blob as Blob
      return 'blob:synthetic'
    }
    URL.revokeObjectURL = () => {}
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    try {
      const { renderHook } = await import('@testing-library/react')
      const hook = renderHook(() => useNavStore())
      await waitFor(() => expect(hook.result.current.syncMode).toBe('local'))

      act(() => {
        hook.result.current.exportData()
      })
      expect(exportedBlob).toBeDefined()
      expect(exportedBlob!.size).toBeGreaterThan(1024 * 1024)

      const onImportFile = vi.fn()
      const onImportError = vi.fn()
      const view = render(
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
          onImportError={onImportError}
          onOpenBackground={vi.fn()}
        />
      )

      const fileInput = view.container.querySelector<HTMLInputElement>('input[type="file"]')!
      const exportedFile = new File([exportedBlob!], 'mininav-export.json', {
        type: 'application/json',
      })
      fireEvent.change(fileInput, { target: { files: [exportedFile] } })

      await waitFor(() => expect(onImportFile).toHaveBeenCalledTimes(1))
      expect(onImportError).not.toHaveBeenCalled()
      expect(onImportFile.mock.calls[0]?.[0]?.groups).toHaveLength(2)
      expect(onImportFile.mock.calls[0]?.[0]?.groups[0]?.bookmarks).toHaveLength(400)

      // Oversized non-backup file exceeding MAX_BACKUP_FILE_BYTES is still rejected cleanly
      const oversizedFile = new File(['{}'], 'huge.json', { type: 'application/json' })
      Object.defineProperty(oversizedFile, 'size', {
        value: MAX_BACKUP_FILE_BYTES + 1,
      })
      fireEvent.change(fileInput, { target: { files: [oversizedFile] } })
      expect(onImportError).toHaveBeenCalledWith(`文件不能超过 ${MAX_BACKUP_FILE_MB} MB`)
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
      anchorClickSpy.mockRestore()
      vi.unstubAllGlobals()
      localStorage.clear()
    }
  })
})
