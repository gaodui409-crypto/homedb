import 'server-only'
import crypto from 'crypto'

const TOKEN_EXPIRY_DAYS = 30

function getSecret(): string {
  return process.env.NAV_PASSWORD || 'secret'
}

// Timing-safe string comparison that never throws on length mismatch
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Still do a comparison to keep timing consistent
    crypto.timingSafeEqual(bufA, bufA)
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

// Create HMAC-signed stateless token
export function createToken(): string {
  const timestamp = Date.now().toString()
  const hmac = crypto.createHmac('sha256', getSecret()).update(timestamp).digest('hex')
  return `${timestamp}.${hmac}`
}

// Verify HMAC token and check expiry
export function verifyToken(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return false

    const [timestamp, providedHmac] = parts
    const expectedHmac = crypto.createHmac('sha256', getSecret()).update(timestamp).digest('hex')

    if (!safeCompare(providedHmac, expectedHmac)) return false

    const tokenTime = parseInt(timestamp, 10)
    if (Number.isNaN(tokenTime)) return false

    const maxAge = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    return Date.now() - tokenTime < maxAge
  } catch {
    return false
  }
}

// Check whether a request is authorized. Returns true when no password is
// configured (open mode) or when a valid Bearer token is provided.
export function isRequestAuthorized(request: Request): boolean {
  if (!process.env.NAV_PASSWORD) return true

  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token || token === 'no-auth-required') return false

  return verifyToken(token)
}
