// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BackgroundModal,
  BookmarkModal,
  GroupModal,
  ImportModeModal,
} from './admin-modals'
import type { Group } from '@/lib/types'

const groups: Group[] = [
  { id: 'g-1', name: '常用', order: 0, color: '#3B82F6', bookmarks: [] },
]

afterEach(cleanup)

describe('BookmarkModal', () => {
  it('suggests site name from URL on blur, accepts 500-char notes, and submits on Ctrl+Enter', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onClose = vi.fn()

    render(
      <BookmarkModal
        state={{ groupId: 'g-1' }}
        groups={groups}
        onSave={onSave}
        onClose={onClose}
      />
    )

    const urlInput = screen.getByLabelText('网址')
    const noteInput = screen.getByLabelText('备注（选填）')

    await user.type(urlInput, 'cloudflare.com')
    fireEvent.blur(urlInput)

    expect((screen.getByLabelText('名称') as HTMLInputElement).value).toBe('Cloudflare')

    const longNote = '内'.repeat(450)
    fireEvent.change(noteInput, { target: { value: longNote } })
    expect(screen.getByText('450/500')).toBeTruthy()

    fireEvent.keyDown(noteInput, { key: 'Enter', ctrlKey: true })

    expect(onSave).toHaveBeenCalledWith(
      'g-1',
      'Cloudflare',
      'https://cloudflare.com/',
      '',
      'g-1',
      longNote
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('rejects whitespace-only names, validates invalid custom icon URLs, and closes on Escape', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onClose = vi.fn()

    render(
      <BookmarkModal
        state={{ groupId: 'g-1' }}
        groups={groups}
        onSave={onSave}
        onClose={onClose}
      />
    )

    await user.type(screen.getByLabelText('网址'), 'https://demo.example.com')
    await user.clear(screen.getByLabelText('名称'))
    await user.type(screen.getByLabelText('名称'), '   ')
    await user.click(screen.getByRole('button', { name: '添加' }))
    expect(screen.getByRole('alert').textContent).toContain('请填写名称')

    await user.clear(screen.getByLabelText('名称'))
    await user.type(screen.getByLabelText('名称'), 'Demo')
    await user.type(screen.getByLabelText('图标（选填）'), 'javascript:alert(1)')
    await user.click(screen.getByRole('button', { name: '添加' }))

    expect(screen.getByRole('alert').textContent).toContain('图标网址格式不对')
    expect(onSave).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('BackgroundModal, GroupModal, and ImportModeModal', () => {
  it('blocks unsafe wallpaper schemes and saves valid HTTPS wallpaper URLs', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onClose = vi.fn()

    render(
      <BackgroundModal
        current={{ type: 'none' }}
        onSave={onSave}
        onClose={onClose}
      />
    )

    const input = screen.getByLabelText('壁纸网址')
    await user.type(input, 'javascript:evil()')
    await user.click(screen.getByRole('button', { name: '应用' }))

    expect(screen.getByRole('alert').textContent).toContain('图片网址格式不对')
    expect(onSave).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, 'https://images.example.com/wall.jpg')
    await user.click(screen.getByRole('button', { name: '应用' }))

    expect(onSave).toHaveBeenCalledWith({
      type: 'image',
      value: 'https://images.example.com/wall.jpg',
    })
  })

  it('creates a group via Ctrl+Enter and dispatches import modes', async () => {
    const user = userEvent.setup()
    const onSaveGroup = vi.fn()
    const onImport = vi.fn()

    render(<GroupModal state={{}} onSave={onSaveGroup} onClose={vi.fn()} />)
    const groupName = screen.getByLabelText('名称')
    await user.type(groupName, '开发文档')
    fireEvent.keyDown(groupName, { key: 'Enter', metaKey: true })
    expect(onSaveGroup).toHaveBeenCalledWith('开发文档', '#3B82F6')

    cleanup()
    render(<ImportModeModal fileName="mininav-export.json" onImport={onImport} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '合并保留' }))
    expect(onImport).toHaveBeenCalledWith('merge')
  })
})
