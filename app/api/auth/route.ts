import { NextRequest, NextResponse } from 'next/server'
import { createToken, isAuthorizationValid } from '@/lib/auth-token'

// POST: Login with password
export async function POST(request: NextRequest) {
  const password = process.env.NAV_PASSWORD

  // If no password is set, return a dummy token (no auth required)
  if (!password) {
    return NextResponse.json({ token: 'no-auth-required', noAuth: true })
  }

  try {
    const body = await request.json()
    const inputPassword = body.password

    if (inputPassword === password) {
      const token = createToken(password)
      return NextResponse.json({ token })
    } else {
      return NextResponse.json({ error: '密码错误' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }
}

// GET: Validate token
export async function GET(request: NextRequest) {
  const password = process.env.NAV_PASSWORD

  // If no password is set, always valid
  if (!password) {
    return NextResponse.json({ valid: true, noAuth: true })
  }

  if (isAuthorizationValid(request.headers.get('Authorization'), password)) {
    return NextResponse.json({ valid: true })
  }

  return NextResponse.json({ valid: false }, { status: 401 })
}
