import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it } from 'vitest'

import { GET } from './route'

describe('GET /api/auth', () => {
  afterEach(() => {
    delete process.env.NAV_PASSWORD
  })

  it('returns 401 for a malformed bearer token instead of throwing', async () => {
    process.env.NAV_PASSWORD = 'review-secret'
    const request = new NextRequest('http://localhost/api/auth', {
      headers: { Authorization: 'Bearer 0.x' },
    })

    const response = await GET(request)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ valid: false })
  })
})
