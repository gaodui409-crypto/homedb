// @vitest-environment jsdom

import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { QuickBar } from './quick-bar'
import type { Bookmark } from '@/lib/types'

type QuickBarHasGroupsProp = 'groups' extends keyof ComponentProps<typeof QuickBar>
  ? true
  : false

const quickBarHasGroupsProp: QuickBarHasGroupsProp = false

const pinnedBookmark: Bookmark = {
  id: 'pinned',
  name: 'Pinned App',
  url: 'https://pinned.example',
  order: 0,
  pinned: true,
}

afterEach(cleanup)

describe('QuickBar', () => {
  it('removes group anchors while keeping a right-aligned search row', () => {
    const onSearchChange = vi.fn()

    const { container } = render(
      <QuickBar
        pinnedBookmarks={[]}
        frequentBookmarks={[]}
        adminMode={false}
        searchQuery="query"
        onSearchChange={onSearchChange}
        onOpenBookmark={vi.fn()}
      />
    )

    expect(quickBarHasGroupsProp).toBe(false)
    expect(container.querySelector('a[href^="#group-"]')).toBeNull()

    const search = screen.getByRole('textbox', { name: '搜索书签' })
    expect(search.getAttribute('value')).toBe('query')
    expect(search.closest('[data-search-row]')?.className).toContain('justify-end')

    fireEvent.change(search, { target: { value: 'next' } })
    expect(onSearchChange).toHaveBeenCalledWith('next')
  })

  it('treats whitespace as no search and preserves pinned bookmark opening', () => {
    render(
      <QuickBar
        pinnedBookmarks={[{ bookmark: pinnedBookmark, groupId: 'legacy-group' }]}
        frequentBookmarks={[]}
        adminMode={false}
        searchQuery="   "
        onSearchChange={vi.fn()}
        onOpenBookmark={vi.fn()}
      />
    )

    const pinnedLink = screen.getByRole('link', { name: /Pinned App/ })
    expect(pinnedLink.getAttribute('href')).toBe('https://pinned.example')
    expect(pinnedLink.getAttribute('target')).toBe('_blank')
    expect(pinnedLink.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
