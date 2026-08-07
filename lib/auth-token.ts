import crypto from 'node:crypto'

const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1_000
const HMAC_HEX_LENGTH = 64

export function createToken(secret: string, now = Date.now()): string {
  const timestamp = now.toString()
  const hmac = crypto.createHmac('sha256', secret).update(timestamp).digest('hex')
  return `${timestamp}.${hmac}`
}

export function verifyToken(token: string, secret: string, now = Date.now()): boolean {
  if (!secret) return false

  const parts = token.split('.')
  if (parts.length !== 2) return false

  const [timestamp, providedHmac] = parts
  if (!/^\d+$/.test(timestamp) || !new RegExp(`^[a-f0-9]{${HMAC_HEX_LENGTH}}$`, 'i').test(providedHmac)) {
    return false
  }

  const tokenTime = Number(timestamp)
  if (!Number.isSafeInteger(tokenTime) || tokenTime > now || now - tokenTime > TOKEN_EXPIRY_MS) {
    return false
  }

  const expectedHmac = crypto.createHmac('sha256', secret).update(timestamp).digest('hex')
  const providedBuffer = Buffer.from(providedHmac, 'hex')
  const expectedBuffer = Buffer.from(expectedHmac, 'hex')

  return providedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(providedBuffer, expectedBuffer)
}

export function isAuthorizationValid(
  authorization: string | null,
  password = process.env.NAV_PASSWORD,
  now = Date.now()
): boolean {
  if (!password) return true
  if (!authorization?.startsWith('Bearer ')) return false

  const token = authorization.slice('Bearer '.length)
  return token.length > 0 && verifyToken(token, password, now)
}
