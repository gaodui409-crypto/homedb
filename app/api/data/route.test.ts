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

  function authorizedRequest(
    method = 'GET',
    body?: unknown,
    extraHeaders: Record<string, string> = {}
  ) {
    return new NextRequest('http://localhost/api/data', {
      method,
      headers: {
        Authorization: `Bearer ${createToken(password)}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...extraHeaders,
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

  it('salvages historical Blob data containing minor field quirks or duplicate IDs instead of locking out with 503', async () => {
    const legacyPayload = {
      groups: [
        {
          id: 'g-legacy',
          name: 'Legacy Group',
          order: 0,
          color: '#abc', // legacy 3-char hex
          bookmarks: [
            { id: 'dup', name: 'One', url: 'https://one.example.com', order: 0, icon: 'data:bad' },
            { id: 'dup', name: 'Two', url: 'https://two.example.com', order: 1 },
          ],
        },
      ],
    }
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(legacyPayload)))
        controller.close()
      },
    })
    vi.mocked(get).mockResolvedValueOnce({ statusCode: 200, stream } as never)

    const response = await GET(authorizedRequest())

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Nav-Data-Source')).toBe('stored')
    const json = await response.json()
    expect(json.groups).toHaveLength(1)
    expect(json.groups[0].bookmarks).toHaveLength(2)
    expect(json.groups[0].bookmarks[0].id).not.toBe(json.groups[0].bookmarks[1].id)
  })

  it('rejects invalid data before writing', async () => {
    const response = await POST(authorizedRequest('POST', {
      groups: [{ name: 'missing fields' }],
    }))

    expect(response.status).toBe(400)
    expect(put).not.toHaveBeenCalled()
  })

  it('writes valid navigation data with a matching ETag condition', async () => {
    vi.mocked(put).mockResolvedValueOnce({
      url: 'https://example.blob/nav-data.json',
      etag: 'etag-v2',
    } as never)

    const response = await POST(
      authorizedRequest('POST', { groups: DEFAULT_DATA }, { 'If-Match': 'etag-v1' })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Nav-Data-Etag')).toBe('etag-v2')
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      etag: 'etag-v2',
    })
    expect(put).toHaveBeenCalledWith(
      'nav-data.json',
      expect.any(String),
      expect.objectContaining({
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        ifMatch: 'etag-v1',
      })
    )
  })

  it('rejects unconditional writes missing If-Match / If-None-Match or using wildcard If-Match', async () => {
    const missingCondition = await POST(
      authorizedRequest('POST', { groups: DEFAULT_DATA })
    )
    expect(missingCondition.status).toBe(428)

    const wildcardMatch = await POST(
      authorizedRequest('POST', { groups: DEFAULT_DATA }, { 'If-Match': '*' })
    )
    expect(wildcardMatch.status).toBe(400)
    expect(put).not.toHaveBeenCalled()
  })

  it('returns 412 conflict on ETag mismatch or create-only race instead of overwriting', async () => {
    const preconditionErr = Object.assign(
      new Error('Vercel Blob: Precondition failed: ETag mismatch.'),
      { name: 'BlobPreconditionFailedError' }
    )
    vi.mocked(put).mockRejectedValueOnce(preconditionErr)

    const mismatchRes = await POST(
      authorizedRequest('POST', { groups: DEFAULT_DATA }, { 'If-Match': 'stale-etag' })
    )
    expect(mismatchRes.status).toBe(412)
    await expect(mismatchRes.json()).resolves.toMatchObject({
      success: false,
      conflict: true,
    })

    vi.mocked(put).mockRejectedValueOnce(
      new Error('Vercel Blob: This blob already exists')
    )
    const createRaceRes = await POST(
      authorizedRequest('POST', { groups: DEFAULT_DATA }, { 'If-None-Match': '*' })
    )
    expect(createRaceRes.status).toBe(412)
    expect(put).toHaveBeenLastCalledWith(
      'nav-data.json',
      expect.any(String),
      expect.objectContaining({
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
      })
    )
  })
})
