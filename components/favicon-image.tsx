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
 * builtin icon -> custom HTTP(S) icon URL -> favicon.im -> Google s2 -> DuckDuckGo -> letter avatar.
 * Unknown legacy `builtin:*` markers and IP / intranet hosts skip invalid/remote requests cleanly.
 */
export function FaviconImage({ url, name, customIcon, className = 'size-9 rounded-lg' }: FaviconImageProps) {
  const hasBuiltinPrefix = isBuiltinIcon(customIcon)
  const builtin = hasBuiltinPrefix && customIcon ? getBuiltinIcon(customIcon) : undefined
  const customHttpIcon = !hasBuiltinPrefix && customIcon ? customIcon : undefined
  const sources = builtin
    ? []
    : customHttpIcon
      ? [customHttpIcon, ...getFaviconSources(url)]
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
        className={`flex-shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-inset ring-foreground/[0.06] ${className}`}
        style={{ backgroundColor: `${avatarColor}1E`, color: avatarColor }}
      >
        <Icon className="size-[52%]" strokeWidth={2} aria-hidden="true" />
      </div>
    )
  }

  return (
    <div
      className={`flex-shrink-0 overflow-hidden flex items-center justify-center ${
        exhausted
          ? 'text-white text-sm font-semibold tracking-tight ring-1 ring-inset ring-white/20 shadow-2xs'
          : 'p-1.5 ring-1 ring-inset ring-foreground/[0.08]'
      } ${className}`}
      style={{ backgroundColor: exhausted ? avatarColor : 'var(--favicon-well)' }}
    >
      {!exhausted ? (
        <img
          src={sources[srcIndex]}
          alt={name}
          width={36}
          height={36}
          className="size-full rounded-[4px] object-contain"
          onError={() => setSourceState((current) => ({
            key: sourceKey,
            index: current.key === sourceKey ? current.index + 1 : 1,
          }))}
        />
      ) : (
        <span>{name.trim().charAt(0).toUpperCase() || '?'}</span>
      )}
    </div>
  )
}
