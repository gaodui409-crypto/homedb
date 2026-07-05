'use client'

import { useState } from 'react'
import { X, ExternalLink, ImageIcon, Paintbrush } from 'lucide-react'
import { suggestNameFromUrl } from '@/lib/favicon'
import { FaviconImage } from '@/components/favicon-image'
import { BUILTIN_ICONS, BUILTIN_ICON_PREFIX, isBuiltinIcon } from '@/components/builtin-icons'
import type { Bookmark, Group, BackgroundSetting } from '@/lib/types'

// ── Shared overlay backdrop ──────────────────────────────────────────────
function Backdrop({ onClick }: { onClick: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
      onClick={onClick}
      aria-hidden="true"
    />
  )
}

// ── Modal shell ──────────────────────────────────────────────────────────
function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <>
      <Backdrop onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-card-foreground">{title}</h2>
            <button
              onClick={onClose}
              className="size-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
        </div>
      </div>
    </>
  )
}

function FormField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow'

// ── Bookmark Modal ───────────────────────────────────────────────────────
export interface BookmarkModalState {
  groupId: string
  bookmark?: Bookmark // present when editing
}

interface BookmarkModalProps {
  state: BookmarkModalState
  groups: Group[]
  onSave: (groupId: string, name: string, url: string, icon: string, newGroupId: string, note: string) => void
  onClose: () => void
}

export function BookmarkModal({ state, groups, onSave, onClose }: BookmarkModalProps) {
  const isEdit = !!state.bookmark
  const [name, setName] = useState(state.bookmark?.name ?? '')
  const [url, setUrl] = useState(state.bookmark?.url ?? '')
  const [icon, setIcon] = useState(state.bookmark?.icon ?? '')
  const [note, setNote] = useState(state.bookmark?.note ?? '')
  const [selectedGroupId, setSelectedGroupId] = useState(state.groupId)

  // Auto-suggest name from URL when name is still empty
  const handleUrlBlur = () => {
    if (!name.trim() && url.trim()) {
      const suggested = suggestNameFromUrl(url)
      if (suggested) setName(suggested)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    const finalUrl = url.startsWith('http') ? url : `https://${url}`
    onSave(state.groupId, name.trim(), finalUrl, icon.trim(), selectedGroupId, note)
    onClose()
  }

  return (
    <ModalShell title={isEdit ? '编辑书签' : '添加书签'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Icon Preview */}
        {url && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-accent border border-border">
            <FaviconImage
              key={`${url}|${icon}`}
              url={url.startsWith('http') ? url : `https://${url}`}
              name={name || '?'}
              customIcon={icon.trim() || undefined}
              className="size-8 rounded-lg"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{name || '网站名称'}</p>
              <p className="text-xs text-muted-foreground truncate">{url}</p>
            </div>
            <a
              href={url.startsWith('http') ? url : `https://${url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="在新标签页打开"
            >
              <ExternalLink size={14} />
            </a>
          </div>
        )}

        <FormField label="网站名称">
          <input
            className={inputCls}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：GitHub"
            required
            autoFocus
          />
        </FormField>

        <FormField label="网址 URL">
          <input
            className={inputCls}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={handleUrlBlur}
            placeholder="https://..."
            required
          />
        </FormField>

        <FormField label="备注（可选）">
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例：公司内网需 VPN / 账号是工作邮箱"
            maxLength={100}
          />
        </FormField>

        <FormField label="图标（可选）">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-7 gap-1.5">
              {BUILTIN_ICONS.map(({ id, label, Icon }) => {
                const value = `${BUILTIN_ICON_PREFIX}${id}`
                const selected = icon === value
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setIcon(selected ? '' : value)}
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
              className={inputCls}
              type="text"
              value={isBuiltinIcon(icon) ? '' : icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="或粘贴自定义图标 URL；都留空则自动获取 / 首字母配色"
            />
          </div>
        </FormField>

        <FormField label="所属分组">
          <select
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

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            {isEdit ? '保存修改' : '添加书签'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Group Modal ───────────────────────────────��──────────────────────────
export interface GroupModalState {
  group?: Group // present when editing
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

export function GroupModal({ state, onSave, onClose }: GroupModalProps) {
  const isEdit = !!state.group
  const [name, setName] = useState(state.group?.name ?? '')
  const [color, setColor] = useState(state.group?.color ?? COLOR_PRESETS[0])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave(name.trim(), color)
    onClose()
  }

  return (
    <ModalShell title={isEdit ? '编辑分组' : '新建分组'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="分组名称">
          <input
            className={inputCls}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：AI 工具"
            required
            autoFocus
          />
        </FormField>

        <FormField label="颜色标签">
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
              />
            ))}
          </div>
        </FormField>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            {isEdit ? '保存修改' : '创建分组'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Import Modal ─────────────────────────────────────────────────────────
interface ImportModalProps {
  onImport: (mode: 'overwrite' | 'merge') => void
  onClose: () => void
  fileName: string
}

export function ImportModeModal({ onImport, onClose, fileName }: ImportModalProps) {
  return (
    <ModalShell title="导入数据" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          已解析文件：<span className="font-medium text-foreground">{fileName}</span>
        </p>
        <p className="text-sm text-foreground">请选择导入方式：</p>
        <p className="text-xs text-destructive">覆盖将清除所有现有数据，此操作不可撤销。建议先导出备份。</p>
        <div className="flex gap-2">
          <button
            onClick={() => { onImport('overwrite'); onClose() }}
            className="flex-1 rounded-lg border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            覆盖（不可撤销）
          </button>
          <button
            onClick={() => { onImport('merge'); onClose() }}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            与现有合并
          </button>
        </div>
        <button
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
        >
          取消
        </button>
      </div>
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

export function BackgroundModal({ current, onSave, onClose }: BackgroundModalProps) {
  const [imageUrl, setImageUrl] = useState(current.type === 'image' ? current.value : '')

  return (
    <ModalShell title="背景自定义" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <FormField label="纯色背景">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { onSave({ type: 'none' }); onClose() }}
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
                onClick={() => { onSave({ type: 'color', value: c.value }); onClose() }}
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

        <FormField label="壁纸图片 URL">
          <div className="flex gap-2">
            <input
              className={inputCls}
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://... 图片地址"
            />
            <button
              type="button"
              disabled={!imageUrl.trim()}
              onClick={() => { onSave({ type: 'image', value: imageUrl.trim() }); onClose() }}
              className="flex items-center gap-1.5 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex-shrink-0"
            >
              <ImageIcon size={13} />
              应用
            </button>
          </div>
        </FormField>

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Paintbrush size={12} className="flex-shrink-0" />
          背景设置保存在本设备浏览器中，不随云端同步
        </p>
      </div>
    </ModalShell>
  )
}

export function ConfirmDeleteModal({ message, onConfirm, onClose }: ConfirmDeleteProps) {
  return (
    <ModalShell title="确认删除" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 transition-opacity"
          >
            确认删除
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
