import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DATA } from '@/lib/default-data'

const blobMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@vercel/blob', () => blobMocks)
vi.mock('@/lib/server-auth', () => ({
  isRequestAuthorized: () => true,
}))

import { GET, POST } from './route'

describe('/api/data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token'
  })

  it('returns an uninitialized response only when the blob is absent', async () => {
    blobMocks.get.mockResolvedValue(null)

    const response = await GET(new NextRequest('http://localhost/api/data'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      initialized: false,
      storage: 'blob',
    })
  })

  it('returns an error instead of default data when blob reading fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    blobMocks.get.mockRejectedValue(new Error('temporary failure'))

    const response = await GET(new NextRequest('http://localhost/api/data'))

    expect(response.status).toBe(502)
    consoleError.mockRestore()
  })

  it('rejects invalid data before writing', async () => {
    const request = new NextRequest('http://localhost/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: [{ name: 'missing fields' }] }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(blobMocks.put).not.toHaveBeenCalled()
  })

  it('writes valid navigation data', async () => {
    blobMocks.put.mockResolvedValue({ url: 'https://example.blob/nav-data.json' })
    const request = new NextRequest('http://localhost/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: DEFAULT_DATA }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(blobMocks.put).toHaveBeenCalledOnce()
  })
})
