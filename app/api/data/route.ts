import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { get, put } from '@vercel/blob'
import { isAuthorizationValid } from '@/lib/auth-token'
import { DEFAULT_DATA } from '@/lib/default-data'
import { navDataSchema, salvageNavData } from '@/lib/nav-schema'
import type { NavData } from '@/lib/types'

const BLOB_KEY = 'nav-data.json'
const DATA_SOURCE_HEADER = 'X-Nav-Data-Source'
const DATA_ETAG_HEADER = 'X-Nav-Data-Etag'
const FALLBACK_ETAG_PREFIX = 'sha256:'

type DataSource = 'stored' | 'missing' | 'disabled'

function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

function computeFallbackEtag(raw: string): string {
  return `${FALLBACK_ETAG_PREFIX}${createHash('sha256').update(raw).digest('hex')}`
}

function extractBlobEtag(
  result: {
    blob?: { etag?: string } | null
    headers?: { get?: (name: string) => string | null } | null
  },
  rawText: string
): string {
  const blobEtag = result.blob?.etag?.trim()
  if (blobEtag) return blobEtag
  const headerEtag = result.headers?.get?.('etag')?.trim()
  if (headerEtag) return headerEtag
  return computeFallbackEtag(rawText)
}

function isConditionalWriteConflict(error: unknown, isCreateOnly: boolean): boolean {
  if (!(error instanceof Error)) return false
  const ctorName = error.constructor?.name ?? ''
  if (
    ctorName === 'BlobPreconditionFailedError' ||
    ctorName === 'BlobNotFoundError' ||
    error.name === 'BlobPreconditionFailedError' ||
    error.name === 'BlobNotFoundError' ||
    /precondition failed|etag mismatch|requested blob does not exist/i.test(
      error.message
    )
  ) {
    return true
  }
  if (
    isCreateOnly &&
    /already exists|overwrite|precondition/i.test(error.message)
  ) {
    return true
  }
  return false
}

function dataResponse(
  data: NavData,
  source: DataSource,
  initialized: boolean,
  storage: 'local' | 'blob',
  etag: string | null = null
) {
  const headers: Record<string, string> = { [DATA_SOURCE_HEADER]: source }
  if (etag) {
    headers[DATA_ETAG_HEADER] = etag
  }
  return NextResponse.json(
    { ...data, initialized, storage, ...(etag ? { etag } : {}) },
    { headers }
  )
}

export async function GET(request: NextRequest) {
  if (!isAuthorizationValid(request.headers.get('Authorization'))) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  try {
    if (!isBlobConfigured()) {
      return dataResponse({ groups: DEFAULT_DATA }, 'disabled', false, 'local')
    }

    const result = await get(BLOB_KEY, { access: 'private', useCache: false })

    if (!result) {
      return dataResponse({ groups: DEFAULT_DATA }, 'missing', false, 'blob')
    }
    if (result.statusCode !== 200) {
      throw new Error(`Unexpected Blob response: ${result.statusCode}`)
    }

    const response = new Response(result.stream)
    const rawText = await response.text()
    const recovered = salvageNavData(JSON.parse(rawText))
    if (!recovered) {
      throw new Error('Stored Blob payload is unrecoverable')
    }
    const etag = extractBlobEtag(result, rawText)
    return dataResponse({ groups: recovered.groups }, 'stored', true, 'blob', etag)
  } catch (error) {
    console.error('Error reading from Blob:', error)
    return NextResponse.json({ error: '读取云端数据失败' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorizationValid(request.headers.get('Authorization'))) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: '数据格式不对' }, { status: 400 })
  }

  const parsed = navDataSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: '数据格式不对' }, { status: 400 })
  }

  if (!isBlobConfigured()) {
    return NextResponse.json({ success: true, local: true, message: 'Blob not configured' })
  }

  const ifMatch = request.headers.get('If-Match')?.trim() || ''
  const ifNoneMatch = request.headers.get('If-None-Match')?.trim() || ''
  const isCreateOnly = !ifMatch && ifNoneMatch === '*'

  if (!ifMatch && !isCreateOnly) {
    return NextResponse.json(
      { success: false, error: '缺少云端版本校验，请刷新重试' },
      { status: 428 }
    )
  }
  if (ifMatch === '*') {
    return NextResponse.json(
      { success: false, error: '不支持无条件覆盖云端数据' },
      { status: 400 }
    )
  }

  try {
    if (ifMatch.startsWith(FALLBACK_ETAG_PREFIX)) {
      const current = await get(BLOB_KEY, { access: 'private', useCache: false })
      if (!current) {
        return NextResponse.json(
          { success: false, conflict: true, error: '云端已有新修改' },
          { status: 412 }
        )
      }
      if (current.statusCode !== 200) {
        throw new Error(`Unexpected Blob response: ${current.statusCode}`)
      }
      const currentRaw = await new Response(current.stream).text()
      const currentEtag = extractBlobEtag(current, currentRaw)
      if (currentEtag !== ifMatch) {
        return NextResponse.json(
          { success: false, conflict: true, error: '云端已有新修改' },
          { status: 412 }
        )
      }
    }

    const serialized = JSON.stringify(parsed.data)
    const result = await put(
      BLOB_KEY,
      serialized,
      isCreateOnly
        ? {
            access: 'private',
            addRandomSuffix: false,
            allowOverwrite: false,
          }
        : {
            access: 'private',
            addRandomSuffix: false,
            allowOverwrite: true,
            ifMatch,
          }
    )
    const nextEtag = result.etag?.trim() || computeFallbackEtag(serialized)

    return NextResponse.json(
      { success: true, url: result.url, etag: nextEtag },
      { headers: { [DATA_ETAG_HEADER]: nextEtag } }
    )
  } catch (error) {
    if (isConditionalWriteConflict(error, isCreateOnly)) {
      return NextResponse.json(
        { success: false, conflict: true, error: '云端已有新修改' },
        { status: 412 }
      )
    }
    console.error('Error writing to Blob:', error)
    return NextResponse.json(
      { success: false, error: '云端保存失败' },
      { status: 500 }
    )
  }
}
