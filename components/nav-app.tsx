'use client'

import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { useNavStore, clearToken, getToken } from '@/lib/use-nav-store'
import { AlertTriangle, X, RefreshCw, Undo2 } from 'lucide-react'
import { NavHeader } from '@/components/nav-header'
import { SortableGroup } from '@/components/bookmark-group'
import { BookmarkCard } from '@/components/bookmark-card'
import {
  DesktopGroupSidebar,
  MobileGroupDrawer,
} from '@/components/group-sidebar'
import { useActiveGroup } from '@/hooks/use-active-group'
import {
  bookmarkMatchesQuery,
  buildSidebarItems,
  normalizeSearchQuery,
} from '@/lib/sidebar-navigation'
import {
  BookmarkModal,
  GroupModal,
  ImportModeModal,
  ConfirmDeleteModal,
  BackgroundModal,
} from '@/components/admin-modals'
import type { Bookmark, Group } from '@/lib/types'
import type { ImportNavData } from '@/lib/nav-schema'

type ModalState =
  | { type: 'none' }
  | { type: 'addBookmark'; groupId: string }
  | { type: 'editBookmark'; groupId: string; bookmark: Bookmark }
  | { type: 'addGroup' }
  | { type: 'editGroup'; group: Group }
  | { type: 'deleteGroup'; groupId: string; name: string; count: number }
  | { type: 'importMode'; data: ImportNavData; fileName: string }
  | { type: 'background' }

type ActiveDrag =
  | { type: 'bookmark'; bookmark: Bookmark; initialGroupId: string }
  | { type: 'group'; group: Group }
  | null

type UndoTarget =
  | { kind: 'bookmark'; groupId: string; bookmark: Bookmark; index: number }
  | { kind: 'group'; group: Group; index: number }

interface UndoState {
  id: number
  label: string
  target: UndoTarget
}

function findGroupContainingBookmark(
  groups: Group[],
  bookmarkId: string
): Group | undefined {
  return groups.find((group) => group.bookmarks.some((bm) => bm.id === bookmarkId))
}

function resolveOverGroupId(
  over: DragOverEvent['over'],
  groups: Group[],
  options: { forBookmarkDrop?: boolean; allowCollapsedGroupId?: string } = {}
): string | undefined {
  if (!over) return undefined
  const overType = over.data.current?.type
  let resolvedId: string | undefined

  if (overType === 'group-drop') {
    resolvedId = String(over.data.current?.groupId ?? '') || undefined
  } else if (overType === 'group') {
    resolvedId = String(over.id)
  } else if (overType === 'bookmark') {
    resolvedId = findGroupContainingBookmark(groups, String(over.id))?.id
  } else {
    resolvedId = groups.find((group) => group.id === String(over.id))?.id
  }

  if (!resolvedId) return undefined

  if (options.forBookmarkDrop) {
    const targetGroup = groups.find((group) => group.id === resolvedId)
    if (targetGroup?.collapsed && targetGroup.id !== options.allowCollapsedGroupId) {
      return undefined
    }
  }

  return resolvedId
}

function scrollBookmarkCardIntoView(bookmarkId: string): void {
  if (typeof document === 'undefined') return
  const nodes = document.querySelectorAll<HTMLElement>('[data-bookmark-id]')
  for (const node of nodes) {
    if (node.dataset.bookmarkId === bookmarkId) {
      node.scrollIntoView?.({ block: 'nearest' })
      break
    }
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

export function NavApp() {
  const store = useNavStore()
  const { adminMode, setAdminMode } = store
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null)
  const [dragDraftGroups, setDragDraftGroups] = useState<Group[] | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSearchId, setSelectedSearchId] = useState<string | null>(null)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [undoState, setUndoState] = useState<UndoState | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const navigationTriggerRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const mobileSearchInputRef = useRef<HTMLInputElement>(null)
  const activeDragRef = useRef<ActiveDrag>(null)
  const dragDraftGroupsRef = useRef<Group[] | null>(null)
  const undoCounterRef = useRef(0)

  const sortedStoreGroups = useMemo(
    () => [...store.groups].sort((a, b) => a.order - b.order),
    [store.groups]
  )

  const effectiveGroups = dragDraftGroups ?? sortedStoreGroups

  const normalizedSearchQuery = useMemo(
    () => normalizeSearchQuery(searchQuery),
    [searchQuery]
  )

  const filteredGroups = useMemo(() => {
    if (!normalizedSearchQuery) return effectiveGroups
    return effectiveGroups
      .map((group) => ({
        ...group,
        bookmarks: group.bookmarks.filter((b) =>
          bookmarkMatchesQuery(b, normalizedSearchQuery)
        ),
      }))
      .filter((group) => group.bookmarks.length > 0)
  }, [effectiveGroups, normalizedSearchQuery])

  const matchedBookmarks = useMemo(() => {
    if (!normalizedSearchQuery) return []
    const list: Bookmark[] = []
    for (const group of filteredGroups) {
      const sorted = [...group.bookmarks].sort((a, b) => a.order - b.order)
      list.push(...sorted)
    }
    return list
  }, [filteredGroups, normalizedSearchQuery])

  const activeSearchBookmarkId = useMemo(() => {
    if (!normalizedSearchQuery || matchedBookmarks.length === 0) return null
    if (selectedSearchId && matchedBookmarks.some((b) => b.id === selectedSearchId)) {
      return selectedSearchId
    }
    return matchedBookmarks[0]?.id ?? null
  }, [matchedBookmarks, normalizedSearchQuery, selectedSearchId])

  const sidebarItems = useMemo(
    () => buildSidebarItems(sortedStoreGroups, searchQuery),
    [searchQuery, sortedStoreGroups]
  )

  const visibleGroupIds = useMemo(
    () => sidebarItems.filter((item) => !item.disabled).map((item) => item.id),
    [sidebarItems]
  )

  const {
    activeGroupId,
    setActiveGroupId,
    stickyAnchorTop,
  } = useActiveGroup(visibleGroupIds)
  const dragEnabled = store.adminMode && normalizedSearchQuery.length === 0
  const bookmarkDragEnabled = dragEnabled && activeDrag?.type !== 'group'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 5 } })
  )

  const handleLogout = () => {
    clearToken()
    window.location.reload()
  }
  const activeToken = getToken()
  const hasPasswordSession = Boolean(activeToken && activeToken !== 'no-auth-required')

  const openModal = useCallback((nextModal: ModalState) => {
    if (nextModal.type !== 'none') {
      setUndoState(null)
    }
    setModal(nextModal)
  }, [])

  const handleGroupSelect = (id: string) => {
    const target = document.getElementById(`group-${id}`)
    if (!target) return

    setActiveGroupId(id)
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  const focusSearch = useCallback(() => {
    const desktopInput = searchInputRef.current
    const isDesktopVisible =
      desktopInput !== null &&
      (desktopInput.offsetParent !== null ||
        (typeof window.matchMedia === 'function' &&
          window.matchMedia('(min-width: 768px)').matches))

    if (isDesktopVisible && desktopInput) {
      desktopInput.focus()
      desktopInput.select()
      return
    }

    if (mobileSearchOpen && mobileSearchInputRef.current) {
      mobileSearchInputRef.current.focus()
      mobileSearchInputRef.current.select()
      return
    }

    setMobileSearchOpen(true)
  }, [mobileSearchOpen])

  // Global keyboard shortcuts: blocked while modal or mobile drawer is open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (modal.type !== 'none' || navigationOpen) return

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toUpperCase() === 'A') {
        e.preventDefault()
        setAdminMode(!adminMode)
        return
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        focusSearch()
        return
      }

      if (
        e.key === '/' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isEditableTarget(e.target)
      ) {
        e.preventDefault()
        focusSearch()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [adminMode, focusSearch, modal.type, navigationOpen, setAdminMode])

  const handleSearchKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (!normalizedSearchQuery || matchedBookmarks.length === 0) return

      const currentIndex = Math.max(
        0,
        matchedBookmarks.findIndex((b) => b.id === activeSearchBookmarkId)
      )

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const next = matchedBookmarks[(currentIndex + 1) % matchedBookmarks.length]
        if (next) {
          setSelectedSearchId(next.id)
          scrollBookmarkCardIntoView(next.id)
        }
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        const prev =
          matchedBookmarks[
            (currentIndex - 1 + matchedBookmarks.length) % matchedBookmarks.length
          ]
        if (prev) {
          setSelectedSearchId(prev.id)
          scrollBookmarkCardIntoView(prev.id)
        }
        return
      }

      if (event.key === 'Enter') {
        const target = matchedBookmarks[currentIndex]
        if (!target) return
        event.preventDefault()
        store.recordClick(target.id)
        window.open(target.url, '_blank', 'noopener,noreferrer')
      }
    },
    [activeSearchBookmarkId, matchedBookmarks, normalizedSearchQuery, store]
  )

  const pushUndo = useCallback((label: string, target: UndoTarget) => {
    undoCounterRef.current += 1
    setUndoState({
      id: undoCounterRef.current,
      label,
      target,
    })
  }, [])

  const handleApplyUndo = useCallback(() => {
    if (!undoState) return
    const { target } = undoState
    setUndoState(null)
    if (target.kind === 'bookmark') {
      store.restoreBookmark(target.groupId, target.bookmark, target.index)
    } else {
      store.restoreGroup(target.group, target.index)
    }
  }, [store, undoState])

  const handleDeleteBookmarkWithUndo = useCallback(
    (groupId: string, bookmarkId: string) => {
      const group = sortedStoreGroups.find((g) => g.id === groupId)
      if (!group) return
      const sorted = [...group.bookmarks].sort((a, b) => a.order - b.order)
      const index = sorted.findIndex((b) => b.id === bookmarkId)
      const bookmark = index >= 0 ? structuredClone(sorted[index]) : undefined

      store.deleteBookmark(groupId, bookmarkId)
      if (bookmark) {
        pushUndo(`已删除「${bookmark.name}」`, {
          kind: 'bookmark',
          groupId,
          bookmark,
          index,
        })
      }
    },
    [pushUndo, sortedStoreGroups, store]
  )

  const handleDeleteGroupConfirmed = useCallback(
    (groupId: string) => {
      const index = sortedStoreGroups.findIndex((g) => g.id === groupId)
      const group = index >= 0 ? structuredClone(sortedStoreGroups[index]) : undefined
      store.deleteGroup(groupId)
      if (group) {
        pushUndo(`已删除分组「${group.name}」`, {
          kind: 'group',
          group,
          index,
        })
      }
    },
    [pushUndo, sortedStoreGroups, store]
  )

  const handleRequestDeleteGroup = useCallback(
    (group: Group) => {
      if (group.bookmarks.length === 0) {
        handleDeleteGroupConfirmed(group.id)
        return
      }
      openModal({
        type: 'deleteGroup',
        groupId: group.id,
        name: group.name,
        count: group.bookmarks.length,
      })
    },
    [handleDeleteGroupConfirmed, openModal]
  )

  const resetDragState = () => {
    activeDragRef.current = null
    dragDraftGroupsRef.current = null
    setActiveDrag(null)
    setDragDraftGroups(null)
  }

  const handleDragStart = (event: DragStartEvent) => {
    if (!dragEnabled) return

    const snapshot = sortedStoreGroups.map((group) => ({
      ...group,
      bookmarks: [...group.bookmarks].sort((a, b) => a.order - b.order),
    }))

    const data = event.active.data.current
    const activeId = String(event.active.id)

    if (data?.type === 'group') {
      const group = snapshot.find((g) => g.id === activeId)
      if (group) {
        const nextDrag: ActiveDrag = { type: 'group', group }
        activeDragRef.current = nextDrag
        dragDraftGroupsRef.current = snapshot
        setActiveDrag(nextDrag)
        setDragDraftGroups(snapshot)
      }
    } else if (data?.type === 'bookmark') {
      const fromGroup = findGroupContainingBookmark(snapshot, activeId)
      const bookmark = fromGroup?.bookmarks.find((b) => b.id === activeId) ?? data.bookmark
      if (fromGroup && bookmark) {
        const nextDrag: ActiveDrag = {
          type: 'bookmark',
          bookmark,
          initialGroupId: fromGroup.id,
        }
        activeDragRef.current = nextDrag
        dragDraftGroupsRef.current = snapshot
        setActiveDrag(nextDrag)
        setDragDraftGroups(snapshot)
      }
    }
  }

  const handleDragOver = (event: DragOverEvent) => {
    if (!dragEnabled) return

    const { active, over } = event
    const dragState = activeDragRef.current
    if (!over || !dragState || dragState.type !== 'bookmark') return

    const activeId = String(active.id)
    const overId = String(over.id)

    const base = dragDraftGroupsRef.current ?? sortedStoreGroups
    const fromGroup = findGroupContainingBookmark(base, activeId)
    if (!fromGroup) return

    const toGroupId = resolveOverGroupId(over, base, {
      forBookmarkDrop: true,
      allowCollapsedGroupId: dragState.initialGroupId,
    })
    if (!toGroupId || toGroupId === fromGroup.id) return

    const targetGroup = base.find((g) => g.id === toGroupId)
    if (!targetGroup || targetGroup.collapsed) return

    const movedBm = fromGroup.bookmarks.find((b) => b.id === activeId)
    if (!movedBm) return

    const sortedTarget = [...targetGroup.bookmarks].sort((a, b) => a.order - b.order)
    let insertIndex = sortedTarget.length
    if (over.data.current?.type === 'bookmark') {
      const overIndex = sortedTarget.findIndex((b) => b.id === overId)
      if (overIndex !== -1) insertIndex = overIndex
    }

    const nextDraft = base.map((g) => {
      if (g.id === fromGroup.id) {
        const remaining = [...g.bookmarks]
          .sort((a, b) => a.order - b.order)
          .filter((b) => b.id !== activeId)
          .map((b, i) => ({ ...b, order: i }))
        return { ...g, bookmarks: remaining }
      }
      if (g.id === toGroupId) {
        const next = [...sortedTarget]
        next.splice(insertIndex, 0, movedBm)
        return { ...g, bookmarks: next.map((b, i) => ({ ...b, order: i })) }
      }
      return g
    })

    dragDraftGroupsRef.current = nextDraft
    setDragDraftGroups(nextDraft)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    const dragState = activeDragRef.current
    const draft = dragDraftGroupsRef.current
    resetDragState()

    if (!dragEnabled || !over || !dragState) return

    const activeId = String(active.id)
    const overId = String(over.id)

    if (dragState.type === 'group') {
      const overGroupId = resolveOverGroupId(over, sortedStoreGroups)
      if (!overGroupId || overGroupId === activeId) return

      const oldIndex = sortedStoreGroups.findIndex((g) => g.id === activeId)
      const newIndex = sortedStoreGroups.findIndex((g) => g.id === overGroupId)
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        store.reorderGroups(arrayMove(sortedStoreGroups, oldIndex, newIndex))
      }
      return
    }

    if (dragState.type === 'bookmark') {
      const workingGroups = draft ?? sortedStoreGroups
      const currentGroup = findGroupContainingBookmark(workingGroups, activeId)
      if (!currentGroup) return

      const overGroupId =
        resolveOverGroupId(over, workingGroups, {
          forBookmarkDrop: true,
          allowCollapsedGroupId: dragState.initialGroupId,
        }) ?? currentGroup.id

      const targetGroup = workingGroups.find((g) => g.id === overGroupId)
      if (!targetGroup || (targetGroup.collapsed && overGroupId !== dragState.initialGroupId)) {
        return
      }

      const sortedTarget = [...targetGroup.bookmarks].sort((a, b) => a.order - b.order)

      if (currentGroup.id === overGroupId) {
        const currentIndex = sortedTarget.findIndex((b) => b.id === activeId)
        if (currentIndex === -1) return

        let finalBookmarks = sortedTarget
        if (over.data.current?.type === 'bookmark' && overId !== activeId) {
          const candidateIndex = sortedTarget.findIndex((b) => b.id === overId)
          if (candidateIndex !== -1 && candidateIndex !== currentIndex) {
            finalBookmarks = arrayMove(sortedTarget, currentIndex, candidateIndex)
          }
        }

        if (overGroupId === dragState.initialGroupId) {
          const initialGroup = sortedStoreGroups.find((g) => g.id === dragState.initialGroupId)
          const originalIds = [...(initialGroup?.bookmarks ?? [])]
            .sort((a, b) => a.order - b.order)
            .map((b) => b.id)
          const nextIds = finalBookmarks.map((b) => b.id)
          const changed =
            originalIds.length !== nextIds.length ||
            originalIds.some((id, idx) => id !== nextIds[idx])

          if (changed) {
            store.reorderBookmarks(overGroupId, finalBookmarks)
          }
        } else {
          const finalIndex = finalBookmarks.findIndex((b) => b.id === activeId)
          store.moveBookmark(
            dragState.initialGroupId,
            overGroupId,
            activeId,
            finalIndex >= 0 ? finalIndex : sortedTarget.length
          )
        }
      } else {
        let targetIndex = sortedTarget.length
        if (over.data.current?.type === 'bookmark') {
          const overIndex = sortedTarget.findIndex((b) => b.id === overId)
          if (overIndex !== -1) targetIndex = overIndex
        }
        store.moveBookmark(dragState.initialGroupId, overGroupId, activeId, targetIndex)
      }
    }
  }

  const bg = store.background
  const footerSyncLabel =
    store.syncMode === 'local'
      ? '仅存本机'
      : store.syncing
        ? '同步中'
        : store.syncError
          ? '同步失败'
          : store.syncMode === 'checking'
            ? '连接中'
            : '已同步'

  const activeErrorMessage = importError ?? store.syncNotice?.message ?? null
  const activeErrorRetryable = importError ? false : (store.syncNotice?.retryable ?? false)

  return (
    <div
      className="min-h-screen bg-background relative"
      style={{
        '--sticky-navigation-offset': `${stickyAnchorTop + 16}px`,
      } as CSSProperties}
    >
      {bg.type !== 'none' && (
        <>
          <div
            className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
            style={
              bg.type === 'image'
                ? { backgroundImage: `url(${JSON.stringify(bg.value)})` }
                : { backgroundColor: bg.value }
            }
            aria-hidden="true"
          />
          <div
            className={`fixed inset-0 z-0 ${bg.type === 'image' ? 'bg-background/70' : 'bg-background/40'}`}
            aria-hidden="true"
          />
        </>
      )}
      <div className="relative z-10">
        <NavHeader
          title={store.title}
          theme={store.theme}
          adminMode={store.adminMode}
          syncMode={store.syncMode}
          syncing={store.syncing}
          syncError={store.syncError}
          onRetrySync={store.retrySyncToCloud}
          searchQuery={searchQuery}
          searchInputRef={searchInputRef}
          mobileSearchInputRef={mobileSearchInputRef}
          mobileSearchOpen={mobileSearchOpen}
          onMobileSearchOpenChange={setMobileSearchOpen}
          onSearchChange={(q) => {
            setSearchQuery(q)
            setSelectedSearchId(null)
          }}
          onSearchKeyDown={handleSearchKeyDown}
          onThemeChange={store.setTheme}
          onTitleChange={store.setTitle}
          onAdminToggle={() => store.setAdminMode(!store.adminMode)}
          onAddGroup={() => openModal({ type: 'addGroup' })}
          onExport={store.exportData}
          onImportFile={(data, fileName) => {
            setImportError(null)
            openModal({ type: 'importMode', data, fileName })
          }}
          onImportError={(msg) => setImportError(msg)}
          onLogout={hasPasswordSession ? handleLogout : undefined}
          onOpenBackground={() => openModal({ type: 'background' })}
          navigationOpen={navigationOpen}
          onNavigationOpenChange={setNavigationOpen}
          navigationTriggerRef={navigationTriggerRef}
        />

        <MobileGroupDrawer
          items={sidebarItems}
          activeGroupId={activeGroupId}
          open={navigationOpen}
          onOpenChange={setNavigationOpen}
          onSelect={handleGroupSelect}
          triggerRef={navigationTriggerRef}
        />

        <div className="flex items-start">
          <DesktopGroupSidebar
            items={sidebarItems}
            activeGroupId={activeGroupId}
            onSelect={handleGroupSelect}
          />

          <div className="min-w-0 flex-1">
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7">
              {store.adminMode && (
                <div className="mb-6 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
                  <span className="size-2 rounded-full bg-primary inline-block shrink-0" />
                  <span>管理模式：点卡片照常打开，可拖拽或编辑</span>
                </div>
              )}

              {filteredGroups.length === 0 && !normalizedSearchQuery ? (
                <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
                  <p className="text-muted-foreground text-base">还没有分组</p>
                  {store.adminMode && (
                    <button
                      type="button"
                      onClick={() => openModal({ type: 'addGroup' })}
                      className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      新建分组
                    </button>
                  )}
                </div>
              ) : filteredGroups.length === 0 && normalizedSearchQuery ? (
                <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
                  <p className="text-muted-foreground text-base">
                    没找到「{searchQuery.trim()}」
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="px-4 py-2 rounded-lg bg-accent text-foreground text-sm font-medium hover:bg-accent/80 transition-colors"
                  >
                    清除搜索
                  </button>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCorners}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  onDragCancel={resetDragState}
                >
                  <SortableContext items={visibleGroupIds} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-7">
                      {filteredGroups.map((group) => (
                        <SortableGroup
                          key={group.id}
                          group={group}
                          adminMode={store.adminMode}
                          dragEnabled={dragEnabled}
                          bookmarkDragEnabled={bookmarkDragEnabled}
                          forceExpanded={normalizedSearchQuery.length > 0}
                          selectedBookmarkId={activeSearchBookmarkId}
                          onAddBookmark={(gId) => openModal({ type: 'addBookmark', groupId: gId })}
                          onEditBookmark={(gId, bm) =>
                            openModal({ type: 'editBookmark', groupId: gId, bookmark: bm })
                          }
                          onDeleteBookmark={(gId, bId) => {
                            handleDeleteBookmarkWithUndo(gId, bId)
                          }}
                          onTogglePin={(gId, bId) => store.togglePinBookmark(gId, bId)}
                          onEditGroup={(g) => openModal({ type: 'editGroup', group: g })}
                          onDeleteGroup={() => handleRequestDeleteGroup(group)}
                          onToggleCollapse={store.toggleGroupCollapsed}
                          onOpenBookmark={store.recordClick}
                        />
                      ))}

                      {store.adminMode && !normalizedSearchQuery && (
                        <button
                          type="button"
                          onClick={() => openModal({ type: 'addGroup' })}
                          className="w-full rounded-2xl border-2 border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors py-5 text-sm flex items-center justify-center gap-2"
                        >
                          <span className="text-lg font-light leading-none">+</span>
                          <span>新建分组</span>
                        </button>
                      )}
                    </div>
                  </SortableContext>

                  <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
                    {activeDrag?.type === 'bookmark' && (
                      <div className="rotate-2 scale-105 opacity-90">
                        <BookmarkCard
                          bookmark={activeDrag.bookmark}
                          adminMode={false}
                          onEdit={() => {}}
                          onDelete={() => {}}
                        />
                      </div>
                    )}
                    {activeDrag?.type === 'group' && (
                      <div className="rounded-2xl bg-card border border-primary/30 shadow-xl px-4 py-3 opacity-90">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: activeDrag.group.color }}
                          />
                          <span className="text-sm font-semibold text-foreground">
                            {activeDrag.group.name}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            ({activeDrag.group.bookmarks.length} 个书签)
                          </span>
                        </div>
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              )}
            </main>

            <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
              <p className="text-xs text-muted-foreground">
                MiniNav v0.4 · {footerSyncLabel} · <a href="https://github.com/gaodui409-crypto/homedb" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
              </p>
            </footer>
          </div>
        </div>

        {/* Modals */}
        {(modal.type === 'addBookmark' || modal.type === 'editBookmark') && (
          <BookmarkModal
            state={
              modal.type === 'editBookmark'
                ? { groupId: modal.groupId, bookmark: modal.bookmark }
                : { groupId: modal.groupId }
            }
            groups={store.groups}
            onSave={(sourceGroupId, name, url, icon, newGroupId, note) => {
              if (modal.type === 'editBookmark') {
                store.updateBookmark(
                  sourceGroupId,
                  modal.bookmark.id,
                  name,
                  url,
                  icon,
                  newGroupId !== sourceGroupId ? newGroupId : undefined,
                  note
                )
              } else {
                store.addBookmark(newGroupId, name, url, icon, note)
              }
            }}
            onClose={() => setModal({ type: 'none' })}
          />
        )}

        {(modal.type === 'addGroup' || modal.type === 'editGroup') && (
          <GroupModal
            state={modal.type === 'editGroup' ? { group: modal.group } : {}}
            onSave={(name, color) => {
              if (modal.type === 'editGroup') {
                store.updateGroup(modal.group.id, name, color)
              } else {
                store.addGroup(name, color)
              }
            }}
            onClose={() => setModal({ type: 'none' })}
          />
        )}

        {modal.type === 'deleteGroup' && (
          <ConfirmDeleteModal
            message={`确定删除分组「${modal.name}」及组内 ${modal.count} 个书签？`}
            onConfirm={() => {
              handleDeleteGroupConfirmed(modal.groupId)
            }}
            onClose={() => setModal({ type: 'none' })}
          />
        )}

        {modal.type === 'importMode' && (
          <ImportModeModal
            fileName={modal.fileName}
            onImport={(mode) => {
              setUndoState(null)
              store.importData(modal.data, mode)
            }}
            onClose={() => setModal({ type: 'none' })}
          />
        )}

        {modal.type === 'background' && (
          <BackgroundModal
            current={store.background}
            onSave={store.setBackground}
            onClose={() => setModal({ type: 'none' })}
          />
        )}

        {/* Transient Notifications Region (Undo & Sync/Import Errors) */}
        <div
          role="region"
          aria-label="状态通知"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 max-w-[calc(100vw-2rem)] pointer-events-none"
        >
          {undoState && modal.type === 'none' && (
            <UndoToast
              key={undoState.id}
              label={undoState.label}
              onUndo={handleApplyUndo}
              onDismiss={() => setUndoState(null)}
            />
          )}

          {activeErrorMessage && modal.type === 'none' && (
            <SyncErrorToast
              error={activeErrorMessage}
              showRetry={activeErrorRetryable}
              onRetry={store.retrySyncToCloud}
              onDismiss={() => {
                if (importError) setImportError(null)
                else store.clearSyncError()
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function UndoToast({
  label,
  onUndo,
  onDismiss,
}: {
  label: string
  onUndo: () => void
  onDismiss: () => void
}) {
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const timer = setTimeout(onDismiss, 6000)
    return () => clearTimeout(timer)
  }, [paused, onDismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg animate-in slide-in-from-bottom-3 fade-in duration-200"
    >
      <span className="text-sm truncate max-w-[14rem] sm:max-w-xs">{label}</span>
      <button
        type="button"
        onClick={onUndo}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-xs font-medium shrink-0"
      >
        <Undo2 size={12} />
        撤销
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
        aria-label="关闭提示"
      >
        <X size={14} />
      </button>
    </div>
  )
}

function SyncErrorToast({
  error,
  showRetry = true,
  onRetry,
  onDismiss,
}: {
  error: string
  showRetry?: boolean
  onRetry: () => void
  onDismiss: () => void
}) {
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const timer = setTimeout(onDismiss, 8000)
    return () => clearTimeout(timer)
  }, [error, paused, onDismiss])

  return (
    <div
      role="alert"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground shadow-lg animate-in slide-in-from-bottom-3 fade-in duration-200"
    >
      <AlertTriangle size={16} className="shrink-0" />
      <span className="text-sm font-medium">{error}</span>
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-destructive-foreground/20 hover:bg-destructive-foreground/30 transition-colors text-xs font-medium shrink-0"
        >
          <RefreshCw size={12} />
          重试
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="p-1 rounded-md hover:bg-destructive-foreground/20 transition-colors shrink-0"
        aria-label="关闭"
      >
        <X size={14} />
      </button>
    </div>
  )
}
