import { NextRequest, NextResponse } from 'next/server'
import { put, get } from '@vercel/blob'
import { isRequestAuthorized } from '@/lib/server-auth'
import { DEFAULT_DATA } from '@/lib/default-data'
import { navDataSchema } from '@/lib/nav-schema'

const BLOB_KEY = 'nav-data.json'

function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

// GET: Read data from Vercel Blob (requires auth when a password is set)
export async function GET(request: NextRequest) {
  if (!isRequestAuthorized(request)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    if (!isBlobConfigured()) {
      return NextResponse.json({ groups: DEFAULT_DATA, initialized: false, storage: 'local' })
    }

    const result = await get(BLOB_KEY, { access: 'private', useCache: false })

    if (!result) {
      return NextResponse.json({ groups: DEFAULT_DATA, initialized: false, storage: 'blob' })
    }
    if (result.statusCode !== 200) {
      throw new Error(`Unexpected Blob response: ${result.statusCode}`)
    }

    const response = new Response(result.stream)
    const text = await response.text()
    const data = navDataSchema.parse(JSON.parse(text))

    return NextResponse.json({ ...data, initialized: true, storage: 'blob' })
  } catch (error) {
    console.error('Error reading from Blob:', error)
    return NextResponse.json({ error: '云端数据读取失败' }, { status: 502 })
  }
}

// POST: Write data to Vercel Blob (requires auth when a password is set)
export async function POST(request: NextRequest) {
  if (!isRequestAuthorized(request)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const parsed = navDataSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: '数据格式错误' }, { status: 400 })
    }

    if (!isBlobConfigured()) {
      return NextResponse.json({ success: true, local: true, message: 'Blob not configured' })
    }

    const result = await put(BLOB_KEY, JSON.stringify(parsed.data), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
    })

    return NextResponse.json({ success: true, url: result.url })
  } catch (error) {
    console.error('Error writing to Blob:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save data' },
      { status: 500 }
    )
  }
}
