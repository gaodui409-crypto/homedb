'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { getToken, setToken, clearToken } from '@/lib/use-nav-store'

interface AuthGuardProps {
  children: ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function checkAuth() {
      const existingToken = getToken()

      if (!existingToken) {
        try {
          const res = await fetch('/api/auth')
          const data = await res.json()
          if (data.noAuth) {
            setToken('no-auth-required')
            setStatus('authenticated')
            return
          }
        } catch {
          setError('连接失败，请重试')
        }
        setStatus('unauthenticated')
        return
      }

      try {
        const res = await fetch('/api/auth', {
          headers: { Authorization: `Bearer ${existingToken}` },
        })
        const data = await res.json()
        if (data.valid) {
          setStatus('authenticated')
        } else {
          clearToken()
          setStatus('unauthenticated')
        }
      } catch {
        setError('连接失败，请重试')
        setStatus('unauthenticated')
      }
    }

    checkAuth()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = await res.json()

      if (res.ok && data.token) {
        setToken(data.token)
        setStatus('authenticated')
      } else {
        setError(data.error || '登录失败，请重试')
      }
    } catch {
      setError('连接失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="size-8 text-muted-foreground animate-spin" aria-label="加载中" />
      </div>
    )
  }

  if (status === 'authenticated') {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-card rounded-2xl shadow-lg border border-border p-8">
          <div className="flex flex-col items-center gap-4 mb-6">
            <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="size-8 text-primary" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">输入访问密码</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                aria-label="访问密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                className="w-full h-12 px-4 pr-12 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
                autoComplete="current-password"
              />
              <button
                type="button"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
              </button>
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !password}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  验证中…
                </>
              ) : (
                '进入'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
