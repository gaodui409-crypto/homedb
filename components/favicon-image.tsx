'use client'

import { useState, useEffect } from 'react'
import { getFaviconSources, getAvatarColor } from '@/lib/favicon'

interface FaviconImageProps {
  url: string
  name: string
  customIcon?: string
  /** Tailwind size classes for the wrapper, e.g. "size-9 rounded-lg" */
  className?: string
}

/**
 * Renders a bookmark icon with automatic multi-source favicon fallback:
 * custom icon -> favicon.im -> Google s2 -> DuckDuckGo -> letter avatar
 */
export function FaviconImage({ url, name, customIcon, className = 'size-9 rounded-lg' }: FaviconImageProps) {
  const sources = customIcon ? [customIcon, ...getFaviconSources(url)] : getFaviconSources(url)
  const [srcIndex, setSrcIndex] = useState(0)

  // Reset when the bookmark changes
  useEffect(() => {
    setSrcIndex(0)
  }, [url, customIcon])

  const exhausted = srcIndex >= sources.length
  const avatarColor = getAvatarColor(name)

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
          onError={() => setSrcIndex((i) => i + 1)}
        />
      ) : (
        <span>{name.trim().charAt(0).toUpperCase()}</span>
      )}
    </div>
  )
}
