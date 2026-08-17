'use client'

import Image from 'next/image'
import { useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import {
  Sun, BookOpen, Moon, Settings, Download, Upload,
  Plus, Check, X, Pencil, MoreVertical, LogOut, Cloud, Menu, Paintbrush,
  Search, ArrowLeft,
} from 'lucide-react'
import type { Theme } from '@/lib/types'
import { importNavDataSchema, type ImportNavData } from '@/lib/nav-schema'

interface NavHeaderBaseProps {
  title: string
  theme: Theme
  adminMode: boolean
  syncing?: boolean
  searchQuery: string
  onSearchChange: (query: string) => void
  onThemeChange: (t: Theme) => void
  onTitleChange: (t: string) => void
  onAdminToggle: () => void
  onAddGroup: () => void
  onExport: () => void
  onImportFile: (data: ImportNavData, fileName: string) => void
  onLogout?: () => void
  onOpenBackground: () => void
}

type NavHeaderNavigationProps =
  | {
      navigationOpen: boolean
      onNavigationOpenChange: (open: boolean) => void
      navigationTriggerRef: RefObject<HTMLButtonElement | null>
    }
  | {
      navigationOpen?: never
      onNavigationOpenChange?: never
      navigationTriggerRef?: never
    }

type NavHeaderProps = NavHeaderBaseProps & NavHeaderNavigationProps

const THEMES: { key: Theme; icon: React.ReactNode; label: string }[] = [
  { key: 'light', icon: <Sun size={15} />, label: '日间模式' },
  { key: 'sepia', icon: <BookOpen size={15} />, label: '阅读模式' },
  { key: 'dark', icon: <Moon size={15} />, label: '深夜模式' },
]

interface SearchFieldProps {
  query: string
  label: string
  autoFocus?: boolean
  onChange: (query: string) => void
  onEscape?: () => void
}

function SearchField({
  query,
  label,
  autoFocus,
  onChange,
  onEscape,
}: SearchFieldProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onChange('')
    onEscape?.()
  }

  return (
    <div className="flex h-8 min-w-0 flex-1 items-center rounded-[8px] border border-border bg-background focus-within:ring-2 focus-within:ring-primary/30">
      <Search aria-hidden="true" className="ml-2.5 size-3.5 shrink-0 text-muted-foreground" />
      <input
        type="search"
        aria-label={label}
        autoFocus={autoFocus}
        placeholder="搜索书签..."
        value={query}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        className="h-full min-w-0 flex-1 bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <button
          type="button"
          aria-label="清除搜索"
          onClick={() => onChange('')}
          className="mr-1.5 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      )}
    </div>
  )
}

export function NavHeader({
  title,
  theme,
  adminMode,
  syncing,
  searchQuery,
  navigationOpen,
  onNavigationOpenChange,
  navigationTriggerRef,
  onThemeChange,
  onSearchChange,
  onTitleChange,
  onAdminToggle,
  onAddGroup,
  onExport,
  onImportFile,
  onLogout,
  onOpenBackground,
}: NavHeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(title)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const matchedThemeIndex = THEMES.findIndex(({ key }) => key === theme)
  const currentThemeIndex = matchedThemeIndex >= 0 ? matchedThemeIndex : 0
  const currentTheme = THEMES[currentThemeIndex]
  const nextTheme = THEMES[(currentThemeIndex + 1) % THEMES.length]

  const commitTitle = () => {
    const trimmed = draftTitle.trim()
    if (trimmed) onTitleChange(trimmed)
    else setDraftTitle(title)
    setEditingTitle(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1024 * 1024) {
      alert('JSON 文件不能超过 1 MB。')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      let input: unknown
      try {
        input = JSON.parse(ev.target?.result as string)
      } catch {
        alert('JSON 文件解析失败，请检查格式。')
        return
      }

      try {
        const data = importNavDataSchema.parse(input)
        onImportFile(data, file.name)
      } catch {
        alert('JSON 数据内容不兼容，请检查分组、书签和网址字段。')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
    setMobileMenuOpen(false)
  }

  return (
    <header
      data-nav-header="true"
      className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 h-14">
          {mobileSearchOpen ? (
            <div data-mobile-search="true" className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
              <button
                type="button"
                aria-label="关闭搜索"
                onClick={() => setMobileSearchOpen(false)}
                className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
              </button>
              <SearchField
                query={searchQuery}
                label="手机搜索书签"
                autoFocus
                onChange={onSearchChange}
                onEscape={() => setMobileSearchOpen(false)}
              />
            </div>
          ) : (
            <>
          {onNavigationOpenChange && navigationTriggerRef && (
            <button
              ref={navigationTriggerRef}
              type="button"
              aria-label="打开分组导航"
              aria-expanded={navigationOpen}
              onClick={() => onNavigationOpenChange(true)}
              className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
            >
              <Menu aria-hidden="true" className="size-4" />
            </button>
          )}

          {/* Title */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <Image
              src="/mininav-icon.png"
              alt="MiniNav"
              width={22}
              height={22}
              className="shrink-0"
              style={{ width: 22, height: 22 }}
            />
            {editingTitle ? (
              <div className="hidden flex-1 min-w-0 max-w-xs items-center gap-1.5 sm:flex">
                <input
                  className="flex-1 min-w-0 bg-transparent border-b-2 border-primary text-lg font-semibold text-foreground focus:outline-none"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitTitle()
                    if (e.key === 'Escape') { setDraftTitle(title); setEditingTitle(false) }
                  }}
                  autoFocus
                  maxLength={30}
                />
                <button
                  onClick={commitTitle}
                  className="size-6 flex items-center justify-center rounded text-primary hover:bg-primary/10 transition-colors"
                  aria-label="确认修改标题"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => { setDraftTitle(title); setEditingTitle(false) }}
                  className="size-6 flex items-center justify-center rounded text-muted-foreground hover:bg-accent transition-colors"
                  aria-label="取消修改"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="group/title flex min-w-0 items-center gap-1.5">
                <h1 className="sr-only font-semibold text-foreground sm:not-sr-only sm:min-w-0 sm:truncate sm:text-lg">
                  {title}
                </h1>
                {adminMode && (
                  <button
                    onClick={() => { setDraftTitle(title); setEditingTitle(true) }}
                    className="hidden size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover/title:opacity-100 sm:flex"
                    aria-label="编辑标题"
                    title="编辑标题"
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="hidden w-40 shrink-0 md:flex lg:w-48 xl:w-64">
            <SearchField
              query={searchQuery}
              label="搜索书签"
              onChange={onSearchChange}
            />
          </div>

          <button
            type="button"
            aria-label="打开搜索"
            onClick={() => setMobileSearchOpen(true)}
            className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-border text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
          >
            <Search aria-hidden="true" className="size-4" />
          </button>

          {/* Right actions */}
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Admin actions */}
            {adminMode && (
              <>
                {/* Desktop: show buttons directly */}
                <button
                  onClick={onExport}
                  className="hidden sm:flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-accent transition-colors"
                  title="导出 JSON"
                >
                  <Download size={13} />
                  <span>导出</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="hidden sm:flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-accent transition-colors"
                  title="导入 JSON"
                >
                  <Upload size={13} />
                  <span>导入</span>
                </button>
                <button
                  onClick={onAddGroup}
                  className="hidden sm:flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                  title="新建分组"
                >
                  <Plus size={13} />
                  <span>新建分组</span>
                </button>

                {/* Mobile: dropdown menu */}
                <div className="relative sm:hidden">
                  <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    aria-label="更多操作"
                    aria-expanded={mobileMenuOpen}
                  >
                    <MoreVertical size={15} />
                  </button>
                  {mobileMenuOpen && (
                    <>
                      {/* Backdrop to close menu */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setMobileMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] py-1 rounded-lg border border-border bg-card shadow-lg">
                        <button
                          onClick={() => { onAddGroup(); setMobileMenuOpen(false) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                        >
                          <Plus size={14} />
                          <span>新建分组</span>
                        </button>
                        <button
                          onClick={() => { onExport(); setMobileMenuOpen(false) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                        >
                          <Download size={14} />
                          <span>导出 JSON</span>
                        </button>
                        <button
                          onClick={() => { fileInputRef.current?.click() }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                        >
                          <Upload size={14} />
                          <span>导入 JSON</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="sr-only"
                  aria-hidden
                />
              </>
            )}

            {/* Background settings */}
            <button
              onClick={onOpenBackground}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="背景自定义"
              aria-label="背景自定义"
            >
              <Paintbrush size={15} />
            </button>

            {/* Theme switcher */}
            <button
              type="button"
              onClick={() => onThemeChange(nextTheme.key)}
              className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:hidden"
              title={`切换主题，当前${currentTheme.label}`}
              aria-label={`切换主题，当前${currentTheme.label}`}
            >
              {currentTheme.icon}
            </button>
            <div
              data-testid="desktop-theme-switcher"
              className="hidden items-center overflow-hidden rounded-lg border border-border sm:flex"
            >
              {THEMES.map(({ key, icon, label }) => (
                <button
                  key={key}
                  onClick={() => onThemeChange(key)}
                  className={`h-8 w-8 flex items-center justify-center transition-colors ${
                    currentTheme.key === key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  title={label}
                  aria-label={label}
                  aria-pressed={currentTheme.key === key}
                >
                  {icon}
                </button>
              ))}
            </div>

            {/* Sync indicator */}
            {syncing !== undefined && (
              <div
                className="h-8 w-8 flex items-center justify-center"
                title={syncing ? '正在同步...' : '已同步'}
              >
                <Cloud size={15} className={syncing ? 'text-primary animate-pulse' : 'text-green-500'} />
              </div>
            )}

            {/* Admin toggle */}
            <button
              onClick={onAdminToggle}
              className={`h-8 w-8 flex items-center justify-center rounded-lg border transition-colors ${
                adminMode
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
              title={adminMode ? '退出管理模式' : '进入管理模式'}
              aria-label={adminMode ? '退出管理模式' : '进入管理模式'}
              aria-pressed={adminMode}
            >
              <Settings size={15} />
            </button>

            {/* Logout button */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="退出登录"
                aria-label="退出登录"
              >
                <LogOut size={15} />
              </button>
            )}
          </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
