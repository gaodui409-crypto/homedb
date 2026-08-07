'use client'

import * as React from 'react'

import {
  resolveActiveGroupId,
  selectClosestVisibleGroup,
} from '@/lib/sidebar-navigation'

const STICKY_HEADER_TOP = 112
const ACTIVE_GROUP_BAND_HEIGHT = 64
const GROUP_ELEMENT_PREFIX = 'group-'

interface ActiveGroupObserverDependencies {
  getElementById: (id: string) => Element | null
  createObserver?: (
    callback: IntersectionObserverCallback,
    options: IntersectionObserverInit
  ) => Pick<IntersectionObserver, 'observe' | 'disconnect'>
}

export function getActiveGroupRootMargin(viewportHeight: number): string {
  const bottomInset = Math.max(
    0,
    viewportHeight - STICKY_HEADER_TOP - ACTIVE_GROUP_BAND_HEIGHT
  )

  return `-${STICKY_HEADER_TOP}px 0px -${bottomInset}px 0px`
}

export function observeActiveGroups(
  groupIds: string[],
  onActive: (id: string) => void,
  rootMargin: string,
  dependencies: ActiveGroupObserverDependencies
): () => void {
  if (dependencies.createObserver === undefined) return () => {}

  let disposed = false
  const observer = dependencies.createObserver((entries) => {
    if (disposed) return

    const closestId = selectClosestVisibleGroup(entries.map((entry) => ({
      id: entry.target.id.slice(GROUP_ELEMENT_PREFIX.length),
      top: entry.boundingClientRect.top,
      isIntersecting: entry.isIntersecting,
    })), STICKY_HEADER_TOP)

    if (closestId !== null) {
      onActive(closestId)
    }
  }, {
    rootMargin,
  })

  for (const id of groupIds) {
    const element = dependencies.getElementById(`${GROUP_ELEMENT_PREFIX}${id}`)
    if (element !== null) {
      observer.observe(element)
    }
  }

  return () => {
    disposed = true
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

export function useActiveGroup(groupIds: string[]): {
  activeGroupId: string | null
  setActiveGroupId: React.Dispatch<React.SetStateAction<string | null>>
} {
  const [activeGroupId, setActiveGroupId] = React.useState<string | null>(() =>
    resolveActiveGroupId(groupIds, null)
  )
  const viewportHeight = React.useSyncExternalStore(
    subscribeToViewportHeight,
    getViewportHeight,
    getServerViewportHeight
  )

  React.useEffect(() => {
    // Filtering can invalidate stored state before the observer reports again.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveGroupId((currentId) => resolveActiveGroupId(groupIds, currentId))
  }, [groupIds])

  React.useEffect(() => observeActiveGroups(
    groupIds,
    setActiveGroupId,
    getActiveGroupRootMargin(viewportHeight),
    {
      getElementById: (id) => document.getElementById(id),
      createObserver: typeof IntersectionObserver === 'undefined'
        ? undefined
        : (callback, options) => new IntersectionObserver(callback, options),
    }
  ), [groupIds, viewportHeight])

  return {
    activeGroupId: resolveActiveGroupId(groupIds, activeGroupId),
    setActiveGroupId,
  }
}
