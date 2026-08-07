import { NextRequest, NextResponse } from 'next/server'
import { put, get } from '@vercel/blob'
import { isAuthorizationValid } from '@/lib/auth-token'
import { parseStoredNavData } from '@/lib/nav-data'

const BLOB_KEY = 'nav-data.json'
const DATA_SOURCE_HEADER = 'X-Nav-Data-Source'

// Default data when blob doesn't exist
const DEFAULT_DATA = {
  groups: [
    {
      id: 'default-ai-tools',
      name: 'AI 工具',
      order: 0,
      color: '#3B82F6',
      bookmarks: [
        { id: 'bm-chatgpt', name: 'ChatGPT', url: 'https://chat.openai.com', order: 0 },
        { id: 'bm-claude', name: 'Claude', url: 'https://claude.ai', order: 1 },
        { id: 'bm-gemini', name: 'Gemini', url: 'https://gemini.google.com', order: 2 },
      ],
    },
    {
      id: 'default-dev',
      name: '开发',
      order: 1,
      color: '#10B981',
      bookmarks: [
        { id: 'bm-github', name: 'GitHub', url: 'https://github.com', order: 0 },
        { id: 'bm-vercel', name: 'Vercel', url: 'https://vercel.com', order: 1 },
        { id: 'bm-stackoverflow', name: 'Stack Overflow', url: 'https://stackoverflow.com', order: 2 },
      ],
    },
    {
      id: 'default-social',
      name: '社交',
      order: 2,
      color: '#F59E0B',
      bookmarks: [
        { id: 'bm-twitter', name: 'X / Twitter', url: 'https://x.com', order: 0 },
        { id: 'bm-youtube', name: 'YouTube', url: 'https://youtube.com', order: 1 },
        { id: 'bm-reddit', name: 'Reddit', url: 'https://reddit.com', order: 2 },
      ],
    },
  ],
}

// Check if Blob is configured
function isBlobConfigured(): boolean {
  const configured = !!process.env.BLOB_READ_WRITE_TOKEN
  console.log('[v0] Blob configured:', configured)
  return configured
}

// GET: Read data from Vercel Blob
export async function GET(request: NextRequest) {
  console.log('[v0] GET /api/data called')

  if (!isAuthorizationValid(request.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    const blobConfigured = isBlobConfigured()
    
    if (!blobConfigured) {
      console.log('[v0] Blob not configured, returning default data')
      return NextResponse.json(DEFAULT_DATA, {
        headers: { [DATA_SOURCE_HEADER]: 'disabled' },
      })
    }

    // Read blob using get() for private store
    console.log('[v0] Reading blob for key:', BLOB_KEY)
    let result
    try {
      result = await get(BLOB_KEY, { access: 'private' })
    } catch (error) {
      console.error('[v0] Error reading from Blob:', error)
      return NextResponse.json(
        { error: 'Cloud data is temporarily unavailable' },
        { status: 503 }
      )
    }
    
    if (!result) {
      console.log('[v0] Blob does not exist, returning default data')
      return NextResponse.json(DEFAULT_DATA, {
        headers: { [DATA_SOURCE_HEADER]: 'missing' },
      })
    }

    if (result.statusCode !== 200) {
      return NextResponse.json(
        { error: 'Cloud data is temporarily unavailable' },
        { status: 503 }
      )
    }

    console.log('[v0] Blob found, reading content...')
    
    // Read the blob content using Response wrapper for stream
    const response = new Response(result.stream)
    const text = await response.text()
    const data = parseStoredNavData(JSON.parse(text))
    
    console.log('[v0] Blob data fetched, groups count:', data?.groups?.length)
    return NextResponse.json(data, {
      headers: { [DATA_SOURCE_HEADER]: 'stored' },
    })
  } catch (error) {
    console.error('[v0] Error reading from Blob:', error)
    return NextResponse.json(
      { error: 'Cloud data is invalid or unavailable' },
      { status: 502 }
    )
  }
}

// POST: Write data to Vercel Blob
export async function POST(request: NextRequest) {
  console.log('[v0] POST /api/data called')

  if (!isAuthorizationValid(request.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    let data
    try {
      data = parseStoredNavData(await request.json())
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid navigation data' },
        { status: 400 }
      )
    }

    const blobConfigured = isBlobConfigured()
    
    if (!blobConfigured) {
      console.log('[v0] Blob not configured, skipping cloud save')
      return NextResponse.json({ success: true, local: true, message: 'Blob not configured' })
    }

    console.log('[v0] Data received, groups count:', data?.groups?.length)
    
    const result = await put(BLOB_KEY, JSON.stringify(data), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
    })

    console.log('[v0] Blob put successful, URL:', result.url)
    return NextResponse.json({ success: true, url: result.url })
  } catch (error) {
    console.error('[v0] Error writing to Blob:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save data' },
      { status: 500 }
    )
  }
}
