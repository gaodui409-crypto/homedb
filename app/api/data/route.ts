import { NextRequest, NextResponse } from 'next/server'
import { put, get } from '@vercel/blob'
import { isRequestAuthorized } from '@/lib/server-auth'

const BLOB_KEY = 'nav-data.json'

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
      return NextResponse.json(DEFAULT_DATA)
    }

    const result = await get(BLOB_KEY, { access: 'private' }).catch(() => null)

    if (!result || result.statusCode !== 200) {
      return NextResponse.json(DEFAULT_DATA)
    }

    const response = new Response(result.stream)
    const text = await response.text()
    const data = JSON.parse(text)

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error reading from Blob:', error)
    return NextResponse.json(DEFAULT_DATA)
  }
}

// POST: Write data to Vercel Blob (requires auth when a password is set)
export async function POST(request: NextRequest) {
  if (!isRequestAuthorized(request)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    if (!isBlobConfigured()) {
      return NextResponse.json({ success: true, local: true, message: 'Blob not configured' })
    }

    const data = await request.json()

    // Basic payload validation to avoid corrupting stored data
    if (!data || !Array.isArray(data.groups)) {
      return NextResponse.json({ success: false, error: '数据格式错误' }, { status: 400 })
    }

    const result = await put(BLOB_KEY, JSON.stringify(data), {
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
