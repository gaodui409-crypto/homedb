'use client'

import * as React from 'react'

import {
  resolveActiveGroupId,
  selectClosestVisibleGroup,
} from '@/lib/sidebar-navigation'

const STICKY_HEADER_TOP = 112
const GROUP_ELEMENT_PREFIX = 'group-'

interface ActiveGroupObserverDependencies {
  getElementById: (id: string) => Element | null
  createObserver?: (
    callback: IntersectionObserverCallback,
    options: IntersectionObserverInit
  ) => Pick<IntersectionObserver, 'observe' | 'disconnect'>
}

export function observeActiveGroups(
  groupIds: string[],
  onActive: (id: string) => void,
  dependencies: ActiveGroupObserverDependencies
): () => void {
  if (dependencies.createObserver === undefined) return () => {}

  const observer = dependencies.createObserver((entries) => {
    const closestId = selectClosestVisibleGroup(entries.map((entry) => ({
      id: entry.target.id.slice(GROUP_ELEMENT_PREFIX.length),
      top: entry.boundingClientRect.top,
      isIntersecting: entry.isIntersecting,
    })), STICKY_HEADER_TOP)

    if (closestId !== null) {
      onActive(closestId)
    }
  }, {
    rootMargin: `-${STICKY_HEADER_TOP}px 0px -75% 0px`,
  })

  for (const id of groupIds) {
    const element = dependencies.getElementById(`${GROUP_ELEMENT_PREFIX}${id}`)
    if (element !== null) {
      observer.observe(element)
    }
  }

  return () => observer.disconnect()
}

export function useActiveGroup(groupIds: string[]): {
  activeGroupId: string | null
  setActiveGroupId: React.Dispatch<React.SetStateAction<string | null>>
} {
  const [activeGroupId, setActiveGroupId] = React.useState<string | null>(() =>
    resolveActiveGroupId(groupIds, null)
  )

  React.useEffect(() => {
    // Filtering can invalidate stored state before the observer reports again.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveGroupId((currentId) => resolveActiveGroupId(groupIds, currentId))
  }, [groupIds])

  React.useEffect(() => observeActiveGroups(groupIds, setActiveGroupId, {
    getElementById: (id) => document.getElementById(id),
    createObserver: typeof IntersectionObserver === 'undefined'
      ? undefined
      : (callback, options) => new IntersectionObserver(callback, options),
  }), [groupIds])

  return { activeGroupId, setActiveGroupId }
}
