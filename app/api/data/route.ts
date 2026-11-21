import { NextRequest, NextResponse } from 'next/server'
import { get, put } from '@vercel/blob'
import { isAuthorizationValid } from '@/lib/auth-token'
import { DEFAULT_DATA } from '@/lib/default-data'
import { navDataSchema, salvageNavData } from '@/lib/nav-schema'
import type { NavData } from '@/lib/types'

const BLOB_KEY = 'nav-data.json'
const DATA_SOURCE_HEADER = 'X-Nav-Data-Source'

type DataSource = 'stored' | 'missing' | 'disabled'

function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

function dataResponse(
  data: NavData,
  source: DataSource,
  initialized: boolean,
  storage: 'local' | 'blob'
) {
  return NextResponse.json(
    { ...data, initialized, storage },
    { headers: { [DATA_SOURCE_HEADER]: source } }
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
    const recovered = salvageNavData(JSON.parse(await response.text()))
    if (!recovered) {
      throw new Error('Stored Blob payload is unrecoverable')
    }
    return dataResponse({ groups: recovered.groups }, 'stored', true, 'blob')
  } catch (error) {
    console.error('Error reading from Blob:', error)
    return NextResponse.json({ error: '读取云端数据失败' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorizationValid(request.headers.get('Authorization'))) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  try {
    const parsed = navDataSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: '数据格式不对' }, { status: 400 })
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
      { success: false, error: '云端保存失败' },
      { status: 500 }
    )
  }
}
