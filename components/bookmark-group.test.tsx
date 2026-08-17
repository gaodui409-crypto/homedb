// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SortableGroup } from './bookmark-group'
import type { Group } from '@/lib/types'

const dndMocks = vi.hoisted(() => ({
  sortableContext: vi.fn(({ children }: { children: React.ReactNode }) => children),
  useDroppable: vi.fn(() => ({
    setNodeRef: vi.fn(),
    isOver: false,
  })),
  useSortable: vi.fn(() => ({
    attributes: { role: 'button' },
    listeners: { onPointerDown: vi.fn() },
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  })),
}))

vi.mock('@dnd-kit/core', () => ({
  useDroppable: dndMocks.useDroppable,
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: dndMocks.sortableContext,
  rectSortingStrategy: 'rect-sorting-strategy',
  useSortable: dndMocks.useSortable,
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: vi.fn(() => undefined),
    },
  },
}))

vi.mock('./bookmark-card', () => ({
  BookmarkCard: ({ bookmark }: { bookmark: { id: string } }) => (
    <div data-testid={`bookmark-${bookmark.id}`} />
  ),
}))

const group: Group = {
  id: 'stable-group',
  name: 'Stable Group',
  order: 4,
  color: '#10B981',
  bookmarks: [
    { id: 'second', name: 'Second', url: 'https://second.example', order: 2 },
    { id: 'first', name: 'First', url: 'https://first.example', order: 1 },
  ],
}

beforeEach(() => {
  dndMocks.sortableContext.mockClear()
  dndMocks.useDroppable.mockClear()
  dndMocks.useSortable.mockClear()
})

afterEach(cleanup)

describe('SortableGroup', () => {
  it('exposes a stable scroll target with a dynamic sticky offset fallback', () => {
    const { container } = render(
      <SortableGroup
        group={group}
        adminMode={false}
        onAddBookmark={vi.fn()}
        onEditBookmark={vi.fn()}
        onDeleteBookmark={vi.fn()}
        onTogglePin={vi.fn()}
        onEditGroup={vi.fn()}
        onDeleteGroup={vi.fn()}
        onToggleCollapse={vi.fn()}
        onOpenBookmark={vi.fn()}
      />
    )

    const section = container.querySelector('section')
    expect(section?.id).toBe('group-stable-group')
    expect(section?.getAttribute('data-group-id')).toBe('stable-group')
    expect(section?.className).toContain('scroll-mt-28')
    expect(section?.getAttribute('style')).toContain(
      'scroll-margin-top: var(--sticky-navigation-offset, 7rem)'
    )
  })

  it('preserves group and bookmark ordering metadata for drag and drop', () => {
    render(
      <SortableGroup
        group={group}
        adminMode
        onAddBookmark={vi.fn()}
        onEditBookmark={vi.fn()}
        onDeleteBookmark={vi.fn()}
        onTogglePin={vi.fn()}
        onEditGroup={vi.fn()}
        onDeleteGroup={vi.fn()}
        onToggleCollapse={vi.fn()}
        onOpenBookmark={vi.fn()}
      />
    )

    expect(dndMocks.useSortable).toHaveBeenCalledWith({
      id: 'stable-group',
      disabled: false,
      data: { type: 'group' },
    })
    expect(dndMocks.useDroppable).toHaveBeenCalledWith({
      id: 'group-drop-stable-group',
      disabled: false,
      data: { type: 'group-drop', groupId: 'stable-group' },
    })
    expect(dndMocks.sortableContext).toHaveBeenCalledWith(
      expect.objectContaining({
        items: ['first', 'second'],
        strategy: 'rect-sorting-strategy',
      }),
      undefined
    )
  })

  it('keeps admin controls available while disabling all sorting hooks', () => {
    render(
      <SortableGroup
        group={group}
        adminMode
        dragEnabled={false}
        onAddBookmark={vi.fn()}
        onEditBookmark={vi.fn()}
        onDeleteBookmark={vi.fn()}
        onTogglePin={vi.fn()}
        onEditGroup={vi.fn()}
        onDeleteGroup={vi.fn()}
        onToggleCollapse={vi.fn()}
        onOpenBookmark={vi.fn()}
      />
    )

    expect(dndMocks.useSortable).toHaveBeenCalledWith({
      id: 'stable-group',
      disabled: true,
      data: { type: 'group' },
    })
    expect(dndMocks.useDroppable).toHaveBeenCalledWith({
      id: 'group-drop-stable-group',
      disabled: true,
      data: { type: 'group-drop', groupId: 'stable-group' },
    })
  })
})
