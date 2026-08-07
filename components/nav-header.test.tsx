// @vitest-environment jsdom

import { createRef, type RefObject } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
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
  navigationOpen?: boolean
  onNavigationOpenChange?: (open: boolean) => void
  navigationTriggerRef?: RefObject<HTMLButtonElement | null>
}

function renderHeader(overrides: NavigationOverrides = {}) {
  const navigationOpen = overrides.navigationOpen ?? false
  const onNavigationOpenChange =
    overrides.onNavigationOpenChange ?? vi.fn()
  const navigationTriggerRef =
    overrides.navigationTriggerRef ?? createRef<HTMLButtonElement>()
  const result = render(
    <NavHeader
      title="HomeDB"
      theme="light"
      adminMode={false}
      onThemeChange={vi.fn()}
      onTitleChange={vi.fn()}
      onAdminToggle={vi.fn()}
      onAddGroup={vi.fn()}
      onExport={vi.fn()}
      onImportFile={vi.fn()}
      navigationOpen={navigationOpen}
      onNavigationOpenChange={onNavigationOpenChange}
      navigationTriggerRef={navigationTriggerRef}
    />
  )

  return { ...result, navigationTriggerRef, onNavigationOpenChange }
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
        navigationOpen
        onNavigationOpenChange={onNavigationOpenChange}
        navigationTriggerRef={navigationTriggerRef}
        onThemeChange={vi.fn()}
        onTitleChange={vi.fn()}
        onAdminToggle={vi.fn()}
        onAddGroup={vi.fn()}
        onExport={vi.fn()}
        onImportFile={vi.fn()}
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
        onThemeChange={vi.fn()}
        onTitleChange={vi.fn()}
        onAdminToggle={vi.fn()}
        onAddGroup={vi.fn()}
        onExport={vi.fn()}
        onImportFile={vi.fn()}
      />
    )

    expect(
      screen.queryByRole('button', { name: '打开分组导航' })
    ).toBeNull()
  })
})
