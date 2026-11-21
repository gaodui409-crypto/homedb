import { describe, expect, it } from 'vitest'
import {
  getAvatarColor,
  getDomain,
  getFaviconSources,
  isUnresolvableHost,
  suggestNameFromUrl,
} from './favicon'

describe('favicon and domain utilities', () => {
  it('identifies IPv4, IPv6, localhost, and single-label intranet hosts as unresolvable', () => {
    expect(isUnresolvableHost('http://localhost:3000')).toBe(true)
    expect(isUnresolvableHost('http://nas:5000')).toBe(true)
    expect(isUnresolvableHost('http://192.168.1.1:8080')).toBe(true)
    expect(isUnresolvableHost('http://[::1]:8080')).toBe(true)
    expect(isUnresolvableHost('https://github.com/trending')).toBe(false)
  })

  it('skips third-party favicon fetchers for intranet/IP URLs and returns ordered fallbacks for public domains', () => {
    expect(getFaviconSources('http://10.0.0.5:9090')).toEqual([])

    const sources = getFaviconSources('https://docs.github.com/en')
    expect(sources).toEqual([
      'https://favicon.im/docs.github.com',
      'https://www.google.com/s2/favicons?domain=docs.github.com&sz=64',
      'https://icons.duckduckgo.com/ip3/docs.github.com.ico',
    ])
  })

  it('extracts clean display domains and suggests readable names', () => {
    expect(getDomain('https://www.example.com/path?a=1')).toBe('example.com')
    expect(getDomain('http://192.168.1.2:8080/ui')).toBe('192.168.1.2')
    expect(suggestNameFromUrl('https://www.cloudflare.com/zh-cn')).toBe('Cloudflare')
    expect(suggestNameFromUrl('github.com/user/repo')).toBe('Github')
  })

  it('maps bookmark names deterministically to palette colors', () => {
    const color = getAvatarColor('VPS 01')
    expect(color).toMatch(/^#[0-9A-F]{6}$/i)
    expect(getAvatarColor('VPS 01')).toBe(color)
  })
})
