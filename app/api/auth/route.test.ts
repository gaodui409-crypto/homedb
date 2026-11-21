import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it } from 'vitest'

import { GET, POST } from './route'

describe('/api/auth', () => {
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

  it('returns plain-Chinese errors for wrong password and malformed JSON body', async () => {
    process.env.NAV_PASSWORD = 'review-secret'

    const wrongRes = await POST(
      new NextRequest('http://localhost/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'wrong' }),
      })
    )
    expect(wrongRes.status).toBe(401)
    await expect(wrongRes.json()).resolves.toEqual({ error: '密码不对' })

    const badJsonRes = await POST(
      new NextRequest('http://localhost/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad',
      })
    )
    expect(badJsonRes.status).toBe(400)
    await expect(badJsonRes.json()).resolves.toEqual({ error: '请求无效' })
  })
})
