import { NextRequest } from 'next/server'
import { get, put } from '@vercel/blob'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createToken } from '@/lib/auth-token'
import { DEFAULT_DATA } from '@/lib/default-data'

vi.mock('@vercel/blob', () => ({
  get: vi.fn(),
  put: vi.fn(),
}))

import { GET, POST } from './route'

describe('/api/data authorization', () => {
  beforeEach(() => vi.clearAllMocks())

  afterEach(() => {
    delete process.env.NAV_PASSWORD
    delete process.env.BLOB_READ_WRITE_TOKEN
  })

  it('rejects unauthenticated reads and writes when a password is configured', async () => {
    process.env.NAV_PASSWORD = 'review-secret'

    const readResponse = await GET(new NextRequest('http://localhost/api/data'))
    const writeResponse = await POST(new NextRequest('http://localhost/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: [] }),
    }))

    expect(readResponse.status).toBe(401)
    expect(writeResponse.status).toBe(401)
  })
})

describe('/api/data cloud behavior', () => {
  const password = 'review-secret'

  beforeEach(() => {
    vi.clearAllMocks()
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

  it('marks a missing blob as uninitialized', async () => {
    vi.mocked(get).mockResolvedValueOnce(null)

    const response = await GET(authorizedRequest())

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Nav-Data-Source')).toBe('missing')
    await expect(response.json()).resolves.toMatchObject({
      initialized: false,
      storage: 'blob',
    })
  })

  it('returns 503 instead of default data when Blob cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(get).mockRejectedValueOnce(new Error('temporary outage'))

    const response = await GET(authorizedRequest())

    expect(response.status).toBe(503)
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

    expect(response.headers.get('X-Nav-Data-Source')).toBe('stored')
    await expect(response.json()).resolves.toMatchObject({ groups: [], initialized: true })
  })

  it('rejects invalid data before writing', async () => {
    const response = await POST(authorizedRequest('POST', {
      groups: [{ name: 'missing fields' }],
    }))

    expect(response.status).toBe(400)
    expect(put).not.toHaveBeenCalled()
  })

  it('writes valid navigation data', async () => {
    vi.mocked(put).mockResolvedValueOnce({ url: 'https://example.blob/nav-data.json' } as never)

    const response = await POST(authorizedRequest('POST', { groups: DEFAULT_DATA }))

    expect(response.status).toBe(200)
    expect(put).toHaveBeenCalledOnce()
  })
})
