'use client'

import * as React from 'react'

import {
  resolveActiveGroupId,
  selectClosestVisibleGroup,
} from '@/lib/sidebar-navigation'

const STICKY_HEADER_TOP = 56
const ACTIVE_GROUP_BAND_HEIGHT = 64
const GROUP_ELEMENT_PREFIX = 'group-'
const STICKY_LAYOUT_SELECTORS = ['[data-nav-header]']

interface ActiveGroupObserverDependencies {
  getElementById: (id: string) => Element | null
  createObserver?: (
    callback: IntersectionObserverCallback,
    options: IntersectionObserverInit
  ) => Pick<IntersectionObserver, 'observe' | 'disconnect'>
}

export function resolveStickyAnchorTop(
  bottoms: number[],
  minimum = STICKY_HEADER_TOP
): number {
  const validBottoms = bottoms
    .filter((bottom) => Number.isFinite(bottom))
    .map((bottom) => Math.ceil(bottom))

  return Math.max(minimum, ...validBottoms)
}

export function getActiveGroupRootMargin(
  viewportHeight: number,
  anchorTop = STICKY_HEADER_TOP
): string {
  const stickyAnchorTop = resolveStickyAnchorTop([anchorTop])
  const bottomInset = Math.max(
    0,
    viewportHeight - stickyAnchorTop - ACTIVE_GROUP_BAND_HEIGHT
  )

  return `-${stickyAnchorTop}px 0px -${bottomInset}px 0px`
}

export function observeActiveGroups(
  groupIds: string[],
  onActive: (id: string) => void,
  rootMargin: string,
  dependencies: ActiveGroupObserverDependencies,
  anchorTop = STICKY_HEADER_TOP
): () => void {
  if (dependencies.createObserver === undefined) return () => {}

  let disposed = false
  let lastReportedId: string | null = null
  const observedGroups: Array<{ id: string; element: Element }> = []
  const intersectionState = new Map<Element, boolean>()
  const stickyAnchorTop = resolveStickyAnchorTop([anchorTop])

  function isScrollablePageAtBottom(): boolean {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return false
    }

    const maximumScroll = document.documentElement.scrollHeight - window.innerHeight
    return maximumScroll > 1 && window.scrollY >= maximumScroll - 1
  }

  function reportActiveGroup() {
    if (disposed) return

    const bottomGroupId = isScrollablePageAtBottom()
      ? observedGroups.at(-1)?.id ?? null
      : null
    const closestId = bottomGroupId ?? selectClosestVisibleGroup(
      observedGroups.map((group) => ({
        id: group.id,
        top: group.element.getBoundingClientRect().top,
        isIntersecting: intersectionState.get(group.element) ?? false,
      })),
      stickyAnchorTop
    )

    if (closestId !== null && closestId !== lastReportedId) {
      lastReportedId = closestId
      onActive(closestId)
    }
  }

  const observer = dependencies.createObserver((entries) => {
    for (const entry of entries) {
      intersectionState.set(entry.target, entry.isIntersecting)
    }

    reportActiveGroup()
  }, {
    rootMargin,
  })

  for (const id of groupIds) {
    const element = dependencies.getElementById(`${GROUP_ELEMENT_PREFIX}${id}`)
    if (element !== null) {
      observedGroups.push({ id, element })
      intersectionState.set(element, false)
      observer.observe(element)
    }
  }

  const handleScroll = () => reportActiveGroup()
  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', handleScroll, { passive: true })
  }

  return () => {
    disposed = true
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', handleScroll)
    }
    observer.disconnect()
  }
}

function subscribeToViewportHeight(onStoreChange: () => void): () => void {
  window.addEventListener('resize', onStoreChange)
  return () => window.removeEventListener('resize', onStoreChange)
}

function getViewportHeight(): number {
  return window.innerHeight
}

function getServerViewportHeight(): number {
  return 0
}

function subscribeToStickyLayout(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  window.addEventListener('resize', onStoreChange)

  const elements = STICKY_LAYOUT_SELECTORS
    .map((selector) => document.querySelector(selector))
    .filter((element): element is Element => element !== null)
  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? undefined
    : new ResizeObserver(onStoreChange)

  for (const element of elements) resizeObserver?.observe(element)

  return () => {
    window.removeEventListener('resize', onStoreChange)
    resizeObserver?.disconnect()
  }
}

function getStickyLayoutSnapshot(): number {
  if (typeof document === 'undefined') return STICKY_HEADER_TOP

  const bottoms = STICKY_LAYOUT_SELECTORS.map((selector) => {
    const element = document.querySelector(selector)
    return element?.getBoundingClientRect().bottom ?? Number.NaN
  })

  return resolveStickyAnchorTop(bottoms)
}

function getServerStickyLayoutSnapshot(): number {
  return STICKY_HEADER_TOP
}

export function useActiveGroup(groupIds: string[]): {
  activeGroupId: string | null
  setActiveGroupId: React.Dispatch<React.SetStateAction<string | null>>
  stickyAnchorTop: number
} {
  const [activeGroupId, setActiveGroupId] = React.useState<string | null>(() =>
    resolveActiveGroupId(groupIds, null)
  )
  const viewportHeight = React.useSyncExternalStore(
    subscribeToViewportHeight,
    getViewportHeight,
    getServerViewportHeight
  )
  const stickyAnchorTop = React.useSyncExternalStore(
    subscribeToStickyLayout,
    getStickyLayoutSnapshot,
    getServerStickyLayoutSnapshot
  )

  React.useEffect(() => {
    // Filtering can invalidate stored state before the observer reports again.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveGroupId((currentId) => resolveActiveGroupId(groupIds, currentId))
  }, [groupIds])

  React.useEffect(() => observeActiveGroups(
    groupIds,
    setActiveGroupId,
    getActiveGroupRootMargin(viewportHeight, stickyAnchorTop),
    {
      getElementById: (id) => document.getElementById(id),
      createObserver: typeof IntersectionObserver === 'undefined'
        ? undefined
        : (callback, options) => new IntersectionObserver(callback, options),
    },
    stickyAnchorTop
  ), [groupIds, stickyAnchorTop, viewportHeight])

  return {
    activeGroupId: resolveActiveGroupId(groupIds, activeGroupId),
    setActiveGroupId,
    stickyAnchorTop,
  }
}
