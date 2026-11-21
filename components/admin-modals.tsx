'use client'

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import { X, ExternalLink, ImageIcon, Paintbrush } from 'lucide-react'
import { suggestNameFromUrl } from '@/lib/favicon'
import { normalizeHttpUrl } from '@/lib/nav-schema'
import { FaviconImage } from '@/components/favicon-image'
import { BUILTIN_ICONS, BUILTIN_ICON_PREFIX, isBuiltinIcon } from '@/components/builtin-icons'
import type { Bookmark, Group, BackgroundSetting } from '@/lib/types'

const ModalDismissContext = createContext<(() => void) | null>(null)

function useModalDismiss(fallbackClose: () => void): () => void {
  const ctx = useContext(ModalDismissContext)
  return ctx ?? fallbackClose
}

// ── Native <dialog> Modal Shell ──────────────────────────────────────────
function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const hasNativeModal = typeof dialog.showModal === 'function'
    if (hasNativeModal) {
      if (!dialog.open) {
        dialog.showModal()
      }
    } else {
      dialog.setAttribute('open', '')
    }

    const handleClose = () => {
      dialog.returnValue = ''
      onCloseRef.current()
    }
    dialog.addEventListener('close', handleClose)

    const handleFallbackKeyDown = (event: KeyboardEvent) => {
      if (!hasNativeModal && event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
    }
    if (!hasNativeModal) {
      window.addEventListener('keydown', handleFallbackKeyDown)
    }

    let cleanupLightDismiss: (() => void) | undefined
    if (
      typeof HTMLDialogElement === 'undefined' ||
      !('closedBy' in HTMLDialogElement.prototype)
    ) {
      let pressedOutside = false
      const isOutside = (event: PointerEvent) => {
        if (event.target !== dialog) return false
        const rect = dialog.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return true
        return (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
      }
      const onPointerDown = (event: PointerEvent) => {
        pressedOutside = isOutside(event)
      }
      const onPointerUp = (event: PointerEvent) => {
        if (pressedOutside && isOutside(event)) {
          if (hasNativeModal && dialog.open) dialog.close()
          else onCloseRef.current()
        }
        pressedOutside = false
      }
      dialog.addEventListener('pointerdown', onPointerDown)
      dialog.addEventListener('pointerup', onPointerUp)
      cleanupLightDismiss = () => {
        dialog.removeEventListener('pointerdown', onPointerDown)
        dialog.removeEventListener('pointerup', onPointerUp)
      }
    }

    return () => {
      dialog.removeEventListener('close', handleClose)
      if (!hasNativeModal) {
        window.removeEventListener('keydown', handleFallbackKeyDown)
      }
      cleanupLightDismiss?.()
    }
  }, [])

  const requestClose = useCallback(() => {
    const dialog = dialogRef.current
    if (dialog && typeof dialog.close === 'function' && dialog.open) {
      dialog.close()
    } else {
      onCloseRef.current()
    }
  }, [])

  return (
    <ModalDismissContext.Provider value={requestClose}>
      <dialog
        ref={dialogRef}
        {...({ closedby: 'any' } as Record<string, string>)}
        aria-labelledby={titleId}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 id={titleId} className="text-base font-semibold text-card-foreground">
            {title}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            className="size-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </dialog>
    </ModalDismissContext.Provider>
  )
}

function FormField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
            {label}
          </label>
        ) : (
          <span className="text-sm font-medium text-foreground">{label}</span>
        )}
        {hint && <span className="text-xs text-muted-foreground tabular-nums">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow'

// ── Bookmark Modal ───────────────────────────────────────────────────────
export interface BookmarkModalState {
  groupId: string
  bookmark?: Bookmark
}

interface BookmarkModalProps {
  state: BookmarkModalState
  groups: Group[]
  onSave: (groupId: string, name: string, url: string, icon: string, newGroupId: string, note: string) => void
  onClose: () => void
}

function BookmarkModalBody({ state, groups, onSave, onClose }: BookmarkModalProps) {
  const requestClose = useModalDismiss(onClose)
  const isEdit = !!state.bookmark
  const [name, setName] = useState(state.bookmark?.name ?? '')
  const [url, setUrl] = useState(state.bookmark?.url ?? '')
  const [icon, setIcon] = useState(state.bookmark?.icon ?? '')
  const [note, setNote] = useState(state.bookmark?.note ?? '')
  const [selectedGroupId, setSelectedGroupId] = useState(state.groupId)
  const [formError, setFormError] = useState('')
  const previewUrl = normalizeHttpUrl(url)

  const nameInputRef = useRef<HTMLInputElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const iconInputRef = useRef<HTMLInputElement>(null)

  const baseId = useId()
  const nameId = `${baseId}-name`
  const urlId = `${baseId}-url`
  const noteId = `${baseId}-note`
  const iconId = `${baseId}-icon`
  const groupId = `${baseId}-group`

  const handleUrlBlur = () => {
    if (!name.trim() && url.trim()) {
      const suggested = suggestNameFromUrl(url)
      if (suggested) setName(suggested)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setFormError('请填写名称')
      nameInputRef.current?.focus()
      return
    }
    const finalUrl = normalizeHttpUrl(url)
    if (!finalUrl) {
      setFormError('网址格式不对')
      urlInputRef.current?.focus()
      return
    }

    const iconValue = icon.trim()
    const finalIcon = !iconValue || isBuiltinIcon(iconValue)
      ? iconValue
      : normalizeHttpUrl(iconValue)
    if (finalIcon === null) {
      setFormError('图标网址格式不对')
      iconInputRef.current?.focus()
      return
    }

    onSave(state.groupId, name.trim(), finalUrl, finalIcon, selectedGroupId, note)
    requestClose()
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.requestSubmit()
        }
      }}
      className="flex flex-col gap-4"
    >
      {previewUrl && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-accent/70 border border-border">
          <FaviconImage
            key={`${url}|${icon}`}
            url={previewUrl}
            name={name || '?'}
            customIcon={icon.trim() || undefined}
            className="size-8 rounded-lg"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{name || '网站名称'}</p>
            <p className="text-xs text-muted-foreground truncate">{url}</p>
          </div>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="在新标签页打开"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      )}

      <FormField label="名称" htmlFor={nameId}>
        <input
          ref={nameInputRef}
          id={nameId}
          className={inputCls}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setFormError('')
          }}
          placeholder="例：GitHub"
          maxLength={100}
          required
          autoFocus
        />
      </FormField>

      <FormField label="网址" htmlFor={urlId}>
        <input
          ref={urlInputRef}
          id={urlId}
          className={inputCls}
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setFormError('')
          }}
          onBlur={handleUrlBlur}
          placeholder="https://..."
          maxLength={2048}
          required
        />
      </FormField>

      <FormField
        label="备注（选填）"
        htmlFor={noteId}
        hint={note.length > 400 ? `${note.length}/500` : undefined}
      >
        <textarea
          id={noteId}
          className={`${inputCls} resize-none`}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例：内网需连 VPN / 工作邮箱登录"
          maxLength={500}
        />
      </FormField>

      <FormField label="图标（选填）" htmlFor={iconId}>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-7 gap-1.5">
            {BUILTIN_ICONS.map(({ id, label, Icon }) => {
              const value = `${BUILTIN_ICON_PREFIX}${id}`
              const selected = icon === value
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setIcon(selected ? '' : value)
                    setFormError('')
                  }}
                  className={`aspect-square flex items-center justify-center rounded-lg border transition-colors ${
                    selected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  title={label}
                  aria-label={`内置图标 ${label}`}
                  aria-pressed={selected}
                >
                  <Icon size={15} />
                </button>
              )
            })}
          </div>
          <input
            ref={iconInputRef}
            id={iconId}
            className={inputCls}
            type="text"
            value={isBuiltinIcon(icon) ? '' : icon}
            onChange={(e) => {
              setIcon(e.target.value)
              setFormError('')
            }}
            placeholder="粘贴图标网址（留空自动获取）"
            maxLength={2048}
          />
        </div>
      </FormField>

      <FormField label="分组" htmlFor={groupId}>
        <select
          id={groupId}
          className={inputCls}
          value={selectedGroupId}
          onChange={(e) => setSelectedGroupId(e.target.value)}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </FormField>

      {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={requestClose}
          className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
        >
          取消
        </button>
        <button
          type="submit"
          className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          {isEdit ? '保存' : '添加'}
        </button>
      </div>
    </form>
  )
}

export function BookmarkModal(props: BookmarkModalProps) {
  return (
    <ModalShell title={props.state.bookmark ? '编辑书签' : '添加书签'} onClose={props.onClose}>
      <BookmarkModalBody {...props} />
    </ModalShell>
  )
}

// ── Group Modal ──────────────────────────────────────────────────────────
export interface GroupModalState {
  group?: Group
}

interface GroupModalProps {
  state: GroupModalState
  onSave: (name: string, color: string) => void
  onClose: () => void
}

const COLOR_PRESETS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
  '#F97316', '#6B7280',
]

function GroupModalBody({ state, onSave, onClose }: GroupModalProps) {
  const requestClose = useModalDismiss(onClose)
  const isEdit = !!state.group
  const [name, setName] = useState(state.group?.name ?? '')
  const [color, setColor] = useState(state.group?.color ?? COLOR_PRESETS[0])
  const [formError, setFormError] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const nameId = useId()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setFormError('请填写分组名')
      nameInputRef.current?.focus()
      return
    }
    onSave(name.trim(), color)
    requestClose()
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.requestSubmit()
        }
      }}
      className="flex flex-col gap-4"
    >
      <FormField label="名称" htmlFor={nameId}>
        <input
          ref={nameInputRef}
          id={nameId}
          className={inputCls}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setFormError('')
          }}
          placeholder="例：AI 工具"
          maxLength={100}
          required
          autoFocus
        />
      </FormField>

      <FormField label="颜色">
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="size-7 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                borderColor: color === c ? c : 'transparent',
                outline: color === c ? `2px solid ${c}` : 'none',
                outlineOffset: '2px',
              }}
              aria-label={`选择颜色 ${c}`}
              aria-pressed={color === c}
            />
          ))}
        </div>
      </FormField>

      {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={requestClose}
          className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
        >
          取消
        </button>
        <button
          type="submit"
          className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          {isEdit ? '保存' : '创建'}
        </button>
      </div>
    </form>
  )
}

export function GroupModal(props: GroupModalProps) {
  return (
    <ModalShell title={props.state.group ? '编辑分组' : '新建分组'} onClose={props.onClose}>
      <GroupModalBody {...props} />
    </ModalShell>
  )
}

// ── Import Modal ─────────────────────────────────────────────────────────
interface ImportModalProps {
  onImport: (mode: 'overwrite' | 'merge') => void
  onClose: () => void
  fileName: string
}

function ImportModeModalBody({ onImport, onClose, fileName }: ImportModalProps) {
  const requestClose = useModalDismiss(onClose)
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        文件：<span className="font-medium text-foreground">{fileName}</span>
      </p>
      <p className="text-xs text-destructive">
        覆盖会清空现有书签，建议先导出备份
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { onImport('overwrite'); requestClose() }}
          className="flex-1 rounded-lg border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
        >
          覆盖现有
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => { onImport('merge'); requestClose() }}
          className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          合并保留
        </button>
      </div>
      <button
        type="button"
        onClick={requestClose}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
      >
        取消
      </button>
    </div>
  )
}

export function ImportModeModal(props: ImportModalProps) {
  return (
    <ModalShell title="导入书签" onClose={props.onClose}>
      <ImportModeModalBody {...props} />
    </ModalShell>
  )
}

// ── Confirm Delete Modal ─────────────────────────────────────────────────
interface ConfirmDeleteProps {
  message: string
  onConfirm: () => void
  onClose: () => void
}

// ── Background Settings Modal ────────────────────────────────────────────
interface BackgroundModalProps {
  current: BackgroundSetting
  onSave: (bg: BackgroundSetting) => void
  onClose: () => void
}

const BG_COLOR_PRESETS = [
  { label: '雾蓝', value: '#EEF3F8' },
  { label: '暖米', value: '#F6F1E7' },
  { label: '薄荷', value: '#EDF5F0' },
  { label: '浅灰', value: '#F0F0F2' },
  { label: '墨蓝', value: '#12181F' },
  { label: '碳黑', value: '#161616' },
]

function BackgroundModalBody({ current, onSave, onClose }: BackgroundModalProps) {
  const requestClose = useModalDismiss(onClose)
  const [imageUrl, setImageUrl] = useState(current.type === 'image' ? current.value : '')
  const [urlError, setUrlError] = useState('')
  const imageInputId = useId()

  const handleApplyImage = () => {
    const normalized = normalizeHttpUrl(imageUrl)
    if (!normalized) {
      setUrlError('图片网址格式不对')
      return
    }
    onSave({ type: 'image', value: normalized })
    requestClose()
  }

  return (
    <div className="flex flex-col gap-4">
      <FormField label="纯色">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { onSave({ type: 'none' }); requestClose() }}
            className={`h-9 px-3 rounded-lg border text-xs font-medium transition-colors ${
              current.type === 'none'
                ? 'border-primary text-primary bg-primary/10'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            默认
          </button>
          {BG_COLOR_PRESETS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => { onSave({ type: 'color', value: c.value }); requestClose() }}
              className={`size-9 rounded-lg border-2 transition-transform hover:scale-110 ${
                current.type === 'color' && current.value === c.value
                  ? 'border-primary'
                  : 'border-border'
              }`}
              style={{ backgroundColor: c.value }}
              aria-label={`背景色 ${c.label}`}
              title={c.label}
            />
          ))}
        </div>
      </FormField>

      <FormField label="壁纸网址" htmlFor={imageInputId}>
        <div className="flex gap-2">
          <input
            id={imageInputId}
            className={inputCls}
            type="text"
            value={imageUrl}
            onChange={(e) => {
              setImageUrl(e.target.value)
              setUrlError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault()
                handleApplyImage()
              }
            }}
            placeholder="https://..."
          />
          <button
            type="button"
            disabled={!imageUrl.trim()}
            onClick={handleApplyImage}
            className="flex items-center gap-1.5 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex-shrink-0"
          >
            <ImageIcon size={13} />
            应用
          </button>
        </div>
        {urlError && <p role="alert" className="text-xs text-destructive">{urlError}</p>}
      </FormField>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Paintbrush size={12} className="flex-shrink-0" />
        仅存本机浏览器，不同步
      </p>
    </div>
  )
}

export function BackgroundModal(props: BackgroundModalProps) {
  return (
    <ModalShell title="页面背景" onClose={props.onClose}>
      <BackgroundModalBody {...props} />
    </ModalShell>
  )
}

function ConfirmDeleteModalBody({ message, onConfirm, onClose }: ConfirmDeleteProps) {
  const requestClose = useModalDismiss(onClose)
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-foreground">{message}</p>
      <div className="flex gap-2">
        <button
          type="button"
          autoFocus
          onClick={requestClose}
          className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => { onConfirm(); requestClose() }}
          className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 transition-opacity"
        >
          删除
        </button>
      </div>
    </div>
  )
}

export function ConfirmDeleteModal(props: ConfirmDeleteProps) {
  return (
    <ModalShell title="确认删除" onClose={props.onClose}>
      <ConfirmDeleteModalBody {...props} />
    </ModalShell>
  )
}
