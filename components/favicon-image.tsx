'use client'

import { useState } from 'react'
import { getFaviconSources, getAvatarColor } from '@/lib/favicon'
import { isBuiltinIcon, getBuiltinIcon } from '@/components/builtin-icons'

interface FaviconImageProps {
  url: string
  name: string
  customIcon?: string
  /** Tailwind size classes for the wrapper, e.g. "size-9 rounded-lg" */
  className?: string
}

/**
 * Renders a bookmark icon with automatic fallback chain:
 * builtin icon -> custom icon URL -> favicon.im -> Google s2 -> DuckDuckGo -> letter avatar.
 * IP / intranet hosts skip remote favicon services entirely (they only return placeholders).
 */
export function FaviconImage({ url, name, customIcon, className = 'size-9 rounded-lg' }: FaviconImageProps) {
  const builtin = customIcon && isBuiltinIcon(customIcon) ? getBuiltinIcon(customIcon) : undefined
  const sources = builtin
    ? []
    : customIcon
      ? [customIcon, ...getFaviconSources(url)]
      : getFaviconSources(url)
  const sourceKey = `${url}\0${customIcon ?? ''}`
  const [sourceState, setSourceState] = useState({ key: sourceKey, index: 0 })
  const srcIndex = sourceState.key === sourceKey ? sourceState.index : 0

  const exhausted = srcIndex >= sources.length
  const avatarColor = getAvatarColor(name)

  // Builtin icon: tinted background + lucide icon
  if (builtin) {
    const { Icon } = builtin
    return (
      <div
        className={`flex-shrink-0 overflow-hidden flex items-center justify-center ${className}`}
        style={{ backgroundColor: `${avatarColor}22`, color: avatarColor }}
      >
        <Icon className="size-[55%]" strokeWidth={2} aria-hidden="true" />
      </div>
    )
  }

  return (
    <div
      className={`flex-shrink-0 overflow-hidden flex items-center justify-center text-white text-sm font-semibold ${className}`}
      style={exhausted ? { backgroundColor: avatarColor } : undefined}
    >
      {!exhausted ? (
        <img
          src={sources[srcIndex] || '/placeholder.svg'}
          alt={name}
          width={36}
          height={36}
          className="size-full object-contain"
          onError={() => setSourceState((current) => ({
            key: sourceKey,
            index: current.key === sourceKey ? current.index + 1 : 1,
          }))}
        />
      ) : (
        <span>{name.trim().charAt(0).toUpperCase()}</span>
      )}
    </div>
  )
}
