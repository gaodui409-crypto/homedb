// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BookmarkCard } from './bookmark-card'
import type { Bookmark } from '@/lib/types'

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}))

vi.mock('./favicon-image', () => ({
  FaviconImage: ({ name }: { name: string }) => (
    <div data-testid="favicon">{name.slice(0, 1)}</div>
  ),
}))

const baseBookmark: Bookmark = {
  id: 'server-console',
  name: 'Server Console',
  url: 'https://console.example.com/dashboard',
  order: 0,
}

function renderCard(bookmark: Bookmark) {
  const onOpen = vi.fn()
  const result = render(
    <BookmarkCard
      bookmark={bookmark}
      adminMode={false}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onOpen={onOpen}
    />
  )

  return { ...result, onOpen }
}

beforeEach(() => {
  vi.spyOn(window, 'open').mockImplementation(() => null)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BookmarkCard status', () => {
  it('keeps the domain visible while exposing frequent and important states', () => {
    renderCard({
      ...baseBookmark,
      note: '仅公司网络可用',
      clicks: 3,
      pinned: true,
    })

    expect(screen.getByText('console.example.com')).toBeTruthy()
    expect(screen.getByLabelText('常用，已打开 3 次')).toBeTruthy()
    expect(screen.getByLabelText('重点书签')).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看备注' })).toBeTruthy()
  })

  it('does not mark a bookmark as frequent before its third open', () => {
    renderCard({ ...baseBookmark, clicks: 2 })

    expect(screen.queryByLabelText(/常用，已打开/)).toBeNull()
    expect(screen.queryByLabelText('重点书签')).toBeNull()
    expect(screen.queryByRole('button', { name: '查看备注' })).toBeNull()
  })
})

describe('BookmarkCard note', () => {
  it('opens from the note button without opening the bookmark and closes on Escape', async () => {
    const user = userEvent.setup()
    const { onOpen } = renderCard({
      ...baseBookmark,
      note: '仅公司网络可用',
    })

    const noteButton = screen.getByRole('button', { name: '查看备注' })
    await user.click(noteButton)

    expect(screen.getByRole('tooltip').textContent).toBe('仅公司网络可用')
    expect(onOpen).not.toHaveBeenCalled()
    expect(window.open).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(noteButton.getAttribute('aria-expanded')).toBe('false')
  })

  it('supports pointer hover and closes when the pointer leaves', async () => {
    const user = userEvent.setup()
    renderCard({ ...baseBookmark, note: '维护入口' })
    const noteButton = screen.getByRole('button', { name: '查看备注' })

    await user.hover(noteButton)
    expect(screen.getByRole('tooltip').textContent).toBe('维护入口')

    await user.unhover(noteButton)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('opens the bookmark when the card itself is activated', () => {
    const { onOpen } = renderCard({ ...baseBookmark, note: '维护入口' })

    fireEvent.click(screen.getByRole('link', { name: '打开 Server Console' }))

    expect(onOpen).toHaveBeenCalledWith('server-console')
    expect(window.open).toHaveBeenCalledWith(
      baseBookmark.url,
      '_blank',
      'noopener,noreferrer'
    )
  })
})
