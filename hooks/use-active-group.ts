'use client'

import * as React from 'react'

import {
  resolveActiveGroupId,
  selectClosestVisibleGroup,
} from '@/lib/sidebar-navigation'

const STICKY_HEADER_TOP = 112
const GROUP_ELEMENT_PREFIX = 'group-'

interface VisibleGroupEntry {
  id: string
  top: number
  isIntersecting: boolean
}

export function useActiveGroup(groupIds: string[]): {
  activeGroupId: string | null
  setActiveGroupId: React.Dispatch<React.SetStateAction<string | null>>
} {
  const [activeGroupId, setActiveGroupId] = React.useState<string | null>(() =>
    resolveActiveGroupId(groupIds, null)
  )
  const resolvedActiveGroupId = resolveActiveGroupId(groupIds, activeGroupId)

  React.useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    const visibleGroups = new Map<string, VisibleGroupEntry>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = entry.target.id.slice(GROUP_ELEMENT_PREFIX.length)
        visibleGroups.set(id, {
          id,
          top: entry.boundingClientRect.top,
          isIntersecting: entry.isIntersecting,
        })
      }

      const closestId = selectClosestVisibleGroup(
        Array.from(visibleGroups.values()),
        STICKY_HEADER_TOP
      )

      if (closestId !== null) {
        setActiveGroupId(closestId)
      }
    }, {
      rootMargin: `-${STICKY_HEADER_TOP}px 0px 0px 0px`,
    })

    for (const id of groupIds) {
      const element = document.getElementById(`${GROUP_ELEMENT_PREFIX}${id}`)
      if (element !== null) {
        observer.observe(element)
      }
    }

    return () => observer.disconnect()
  }, [groupIds])

  return { activeGroupId: resolvedActiveGroupId, setActiveGroupId }
}
