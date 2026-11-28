// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadStoredGroups } from '@/lib/storage'
import { useNavStore } from '@/lib/use-nav-store'
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

  it('HDB-004: rejects Unicode URLs and custom icon URLs whose percent-encoded length exceeds 2048, preserving form state', async () => {
    localStorage.clear()
    localStorage.setItem('mininav_data', JSON.stringify({ groups }))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ groups, initialized: false, storage: 'local' }),
          { status: 200, headers: { 'X-Nav-Data-Source': 'disabled' } }
        )
      )
    )

    try {
      const hook = renderHook(() => useNavStore())
      await waitFor(() => expect(hook.result.current.syncMode).toBe('local'))

      const rawUnicodeUrl = 'https://example.test/' + '字'.repeat(230)
      expect(rawUnicodeUrl.length).toBeLessThan(2048)

      const onClose = vi.fn()
      const onSave = vi.fn((groupId, name, url, icon, _newGroup, note) => {
        hook.result.current.addBookmark(groupId, name, url, icon, note)
      })

      const view = render(
        <BookmarkModal
          state={{ groupId: 'g-1' }}
          groups={hook.result.current.groups}
          onSave={onSave}
          onClose={onClose}
        />
      )

      const nameInput = screen.getByLabelText('名称') as HTMLInputElement
      const urlInput = screen.getByLabelText('网址') as HTMLInputElement
      const iconInput = screen.getByLabelText('图标（选填）') as HTMLInputElement

      fireEvent.change(nameInput, { target: { value: 'Unicode URL' } })
      fireEvent.change(urlInput, { target: { value: rawUnicodeUrl } })
      fireEvent.submit(view.container.querySelector('form')!)

      expect(onSave).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByRole('alert').textContent).toContain('网址编码后过长')
      expect(urlInput.getAttribute('aria-invalid')).toBe('true')
      expect(nameInput.value).toBe('Unicode URL')
      expect(urlInput.value).toBe(rawUnicodeUrl)

      // Fix main URL, test overlong Unicode custom icon URL as well
      fireEvent.change(urlInput, { target: { value: 'https://example.test/ok' } })
      expect(urlInput.getAttribute('aria-invalid')).toBeNull()

      fireEvent.change(iconInput, { target: { value: rawUnicodeUrl } })
      fireEvent.submit(view.container.querySelector('form')!)

      expect(onSave).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByRole('alert').textContent).toContain('图标网址编码后过长')
      expect(iconInput.getAttribute('aria-invalid')).toBe('true')

      // Clear icon and submit valid bookmark -> persists cleanly across reload
      fireEvent.change(iconInput, { target: { value: '' } })
      act(() => {
        fireEvent.submit(view.container.querySelector('form')!)
      })

      expect(onSave).toHaveBeenCalledTimes(1)
      const reloaded = loadStoredGroups()
      expect(reloaded.status).toBe('valid')
      expect(reloaded.groups[0].bookmarks.map((b) => b.name)).toContain('Unicode URL')
    } finally {
      vi.unstubAllGlobals()
      localStorage.clear()
    }
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
