import { NextRequest } from 'next/server'
import { get, put } from '@vercel/blob'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createToken } from '@/lib/auth-token'

vi.mock('@vercel/blob', () => ({
  get: vi.fn(),
  put: vi.fn(),
}))

import { GET, POST } from './route'

describe('/api/data authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    delete process.env.NAV_PASSWORD
    delete process.env.BLOB_READ_WRITE_TOKEN
  })

  it('rejects an unauthenticated read when a password is configured', async () => {
    process.env.NAV_PASSWORD = 'review-secret'
    const request = new NextRequest('http://localhost/api/data')
    const get = GET as unknown as (request: NextRequest) => Promise<Response>

    const response = await get(request)

    expect(response.status).toBe(401)
  })

  it('rejects an unauthenticated write when a password is configured', async () => {
    process.env.NAV_PASSWORD = 'review-secret'
    const request = new NextRequest('http://localhost/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: [] }),
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
  })
})

describe('/api/data cloud behavior', () => {
  const password = 'review-secret'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    process.env.NAV_PASSWORD = password
    process.env.BLOB_READ_WRITE_TOKEN = 'blob-token'
  })

  afterEach(() => {
    delete process.env.NAV_PASSWORD
    delete process.env.BLOB_READ_WRITE_TOKEN
  })

  function authorizedRequest(method = 'GET', body?: unknown) {
    return new NextRequest('http://localhost/api/data', {
      method,
      headers: {
        Authorization: `Bearer ${createToken(password)}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  it('returns 503 when Blob cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(get).mockRejectedValueOnce(new Error('temporary outage'))

    const response = await GET(authorizedRequest())

    expect(response.status).toBe(503)
  })

  it('marks a missing blob separately from stored data', async () => {
    vi.mocked(get).mockResolvedValueOnce(null)

    const response = await GET(authorizedRequest())

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Nav-Data-Source')).toBe('missing')
  })

  it('keeps an intentionally empty stored dataset authoritative', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"groups":[]}'))
        controller.close()
      },
    })
    vi.mocked(get).mockResolvedValueOnce({ statusCode: 200, stream } as never)

    const response = await GET(authorizedRequest())

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Nav-Data-Source')).toBe('stored')
    await expect(response.json()).resolves.toEqual({ groups: [] })
  })

  it('rejects malformed writes before calling Blob', async () => {
    const response = await POST(authorizedRequest('POST', { groups: [{ name: 'invalid' }] }))

    expect(response.status).toBe(400)
    expect(put).not.toHaveBeenCalled()
  })
})
