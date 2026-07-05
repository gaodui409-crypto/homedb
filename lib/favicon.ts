// Shared favicon + avatar helpers (deduplicated from card / quick-bar / modals)

/** Hosts that never have a public favicon: IPv4/IPv6 addresses, localhost, single-word intranet names */
export function isUnresolvableHost(url: string): boolean {
  try {
    const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
    if (host === 'localhost' || !host.includes('.')) return true
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true // IPv4
    if (host.startsWith('[') || /^[0-9a-f:]+$/i.test(host)) return true // IPv6
    return false
  } catch {
    return true
  }
}

/** Ordered favicon sources — try in sequence before falling back to letter avatar */
export function getFaviconSources(url: string): string[] {
  try {
    // IP addresses / intranet hosts: favicon services only return ugly placeholders — skip straight to letter avatar
    if (isUnresolvableHost(url)) return []
    const domain = new URL(url).hostname
    return [
      `https://favicon.im/${domain}`,
      `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    ]
  } catch {
    return []
  }
}

export function getFaviconUrl(url: string): string {
  return getFaviconSources(url)[0] ?? ''
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export const AVATAR_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
]

export function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffff
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

/** Suggest a bookmark name from a URL, e.g. "https://github.com/foo" -> "Github" */
export function suggestNameFromUrl(url: string): string {
  try {
    const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
    const parts = host.replace(/^www\./, '').split('.')
    const core = parts.length > 1 ? parts[parts.length - 2] : parts[0]
    if (!core) return ''
    return core.charAt(0).toUpperCase() + core.slice(1)
  } catch {
    return ''
  }
}
