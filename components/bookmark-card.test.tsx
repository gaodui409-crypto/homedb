// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BookmarkCard } from './bookmark-card'
import type { Bookmark } from '@/lib/types'

const sortableMocks = vi.hoisted(() => ({
  useSortable: vi.fn(() => ({
    attributes: { 'data-sortable-attr': 'yes' },
    listeners: { 'data-sortable-listener': 'yes' },
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  })),
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: sortableMocks.useSortable,
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

function renderCard(
  bookmark: Bookmark,
  overrides: { adminMode?: boolean; dragEnabled?: boolean } = {}
) {
  const onOpen = vi.fn()
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  const onTogglePin = vi.fn()
  const result = render(
    <BookmarkCard
      bookmark={bookmark}
      adminMode={overrides.adminMode ?? false}
      dragEnabled={overrides.dragEnabled}
      onEdit={onEdit}
      onDelete={onDelete}
      onTogglePin={onTogglePin}
      onOpen={onOpen}
    />
  )

  return { ...result, onOpen, onEdit, onDelete, onTogglePin }
}

beforeEach(() => {
  sortableMocks.useSortable.mockClear()
  vi.spyOn(window, 'open').mockImplementation(() => null)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BookmarkCard status and drag attributes', () => {
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

  it('does not attach drag attributes onto the card when dragEnabled is false in adminMode', () => {
    renderCard(baseBookmark, { adminMode: true, dragEnabled: false })

    const card = screen.getByRole('link', { name: '打开 Server Console' })
    expect(card.getAttribute('data-sortable-attr')).toBeNull()
    expect(card.getAttribute('data-sortable-listener')).toBeNull()
  })

  it('activates admin pin/edit/delete buttons via Enter and Space without opening the bookmark URL', async () => {
    const user = userEvent.setup()
    const { onOpen, onEdit, onDelete, onTogglePin } = renderCard(baseBookmark, {
      adminMode: true,
      dragEnabled: false,
    })

    const pinBtn = screen.getByRole('button', { name: '标记重点' })
    pinBtn.focus()
    await user.keyboard('{Enter}')
    expect(onTogglePin).toHaveBeenCalledWith('server-console')

    const editBtn = screen.getByRole('button', { name: '编辑书签' })
    editBtn.focus()
    await user.keyboard(' ')
    expect(onEdit).toHaveBeenCalledWith(baseBookmark)

    const deleteBtn = screen.getByRole('button', { name: '删除书签' })
    deleteBtn.focus()
    await user.keyboard('{Enter}')
    expect(onDelete).toHaveBeenCalledWith('server-console')

    expect(onOpen).not.toHaveBeenCalled()
    expect(window.open).not.toHaveBeenCalled()
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

  it('toggles open and closed on repeated mobile touch taps', () => {
    const { onOpen } = renderCard({ ...baseBookmark, note: '手机轻触备注' })
    const noteButton = screen.getByRole('button', { name: '查看备注' })

    // 1st touch tap -> opens
    fireEvent.pointerDown(noteButton, { pointerType: 'touch' })
    fireEvent.focus(noteButton)
    fireEvent.click(noteButton, { detail: 1 })
    expect(screen.getByRole('tooltip').textContent).toBe('手机轻触备注')

    // 2nd touch tap -> closes without opening bookmark
    fireEvent.pointerDown(noteButton, { pointerType: 'touch' })
    fireEvent.click(noteButton, { detail: 1 })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('keeps keyboard note activation from opening the bookmark', async () => {
    const user = userEvent.setup()
    const { onOpen } = renderCard({ ...baseBookmark, note: '维护入口' })
    const noteButton = screen.getByRole('button', { name: '查看备注' })

    noteButton.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('tooltip')).toBeTruthy()
    expect(onOpen).not.toHaveBeenCalled()
    expect(window.open).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    await user.keyboard(' ')
    expect(screen.getByRole('tooltip')).toBeTruthy()
    expect(onOpen).not.toHaveBeenCalled()
    expect(window.open).not.toHaveBeenCalled()
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
