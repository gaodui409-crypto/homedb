import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { SidebarItem } from '@/lib/sidebar-navigation'
import { GroupSidebarContent } from './group-sidebar'

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
    count: 3,
    disabled: true,
  },
]

function renderContent(overrides: Partial<{
  items: SidebarItem[]
  activeGroupId: string | null
  collapsed: boolean
}> = {}) {
  return renderToStaticMarkup(
    <GroupSidebarContent
      items={overrides.items ?? items}
      activeGroupId={overrides.activeGroupId ?? null}
      collapsed={overrides.collapsed}
      onSelect={vi.fn()}
    />
  )
}

describe('GroupSidebarContent', () => {
  it('renders names, counts, and color swatches in input order when expanded', () => {
    const markup = renderContent()
    const firstNameIndex = markup.indexOf('Infrastructure')
    const secondNameIndex = markup.indexOf('Reference material')

    expect(firstNameIndex).toBeGreaterThan(-1)
    expect(secondNameIndex).toBeGreaterThan(firstNameIndex)
    expect(markup).toContain('>12<')
    expect(markup).toContain('>3<')
    expect(markup).toContain('background-color:#3B82F6')
    expect(markup).toContain('background-color:#10B981')
    expect(markup).toContain(
      'title="Reference material with a deliberately long group name"'
    )
  })

  it('marks the active item as the current location', () => {
    const markup = renderContent({ activeGroupId: 'infrastructure' })

    expect(markup).toContain('aria-current="location"')
  })

  it('uses the native disabled attribute for disabled items', () => {
    const markup = renderContent()
    const disabledButton = markup.match(/<button[^>]*disabled=""[^>]*>/)

    expect(disabledButton).not.toBeNull()
  })

  it('keeps a collapsed item accessible without visual name or count content', () => {
    const markup = renderContent({ items: [items[0]], collapsed: true })
    const button = markup.match(/<button([^>]*)>([\s\S]*?)<\/button>/)

    expect(button).not.toBeNull()
    expect(button?.[1]).toMatch(/aria-label="[^"]*Infrastructure[^"]*12[^"]*"/)
    expect(button?.[2]).not.toContain('Infrastructure')
    expect(button?.[2]).not.toContain('12')
    expect(button?.[2]).toContain('background-color:#3B82F6')
  })

  it('renders a concise empty state only when expanded', () => {
    expect(renderContent({ items: [] })).toContain('暂无分组')
    expect(renderContent({ items: [], collapsed: true })).not.toContain('暂无分组')
  })
})
