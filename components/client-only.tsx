'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

/**
 * Renders children only after the component has mounted on the client.
 * Prevents SSR/CSR hydration mismatches caused by localStorage-driven state.
 */
export function ClientOnly({ children, fallback = null }: {
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
  if (!mounted) return <>{fallback}</>
  return <>{children}</>
}
