// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NavHeader } from './nav-header'

function renderHeader(
  overrides: Partial<React.ComponentProps<typeof NavHeader>> = {}
) {
  const onNavigationOpenChange =
    overrides.onNavigationOpenChange ?? vi.fn()
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
      navigationOpen={overrides.navigationOpen}
      onNavigationOpenChange={onNavigationOpenChange}
    />
  )

  return { ...result, onNavigationOpenChange }
}

afterEach(cleanup)

describe('NavHeader mobile navigation trigger', () => {
  it('renders before the title, reflects expanded state, and opens navigation', async () => {
    const user = userEvent.setup()
    const { rerender, onNavigationOpenChange } = renderHeader({
      navigationOpen: false,
    })
    const button = screen.getByRole('button', { name: '打开分组导航' })
    const heading = screen.getByRole('heading', { name: 'HomeDB' })

    expect(button.className).toContain('size-8')
    expect(button.className).toContain('rounded-[8px]')
    expect(button.className).toContain('lg:hidden')
    expect(button.getAttribute('aria-expanded')).toBe('false')
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
