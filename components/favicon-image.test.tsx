// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FaviconImage } from './favicon-image'

afterEach(cleanup)

describe('FaviconImage', () => {
  it('renders a known builtin icon as an inline SVG without creating an img request', () => {
    const { container } = render(
      <FaviconImage url="https://vps.example.com" name="VPS 01" customIcon="builtin:server" />
    )

    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('skips unknown legacy builtin:* markers instead of issuing an invalid img src="builtin:*" request', () => {
    const { container } = render(
      <FaviconImage url="https://github.com" name="GitHub" customIcon="builtin:globe" />
    )

    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toContain('favicon.im/github.com')

    // Exhausting all three remote sources falls back cleanly to the uppercase initial
    fireEvent.error(img!)
    fireEvent.error(container.querySelector('img')!)
    fireEvent.error(container.querySelector('img')!)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('G')).toBeTruthy()
  })

  it('skips remote favicon services immediately for IP / intranet hosts', () => {
    const { container } = render(
      <FaviconImage url="http://192.168.1.1:8080" name="路由器" />
    )

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('路')).toBeTruthy()
  })
})
