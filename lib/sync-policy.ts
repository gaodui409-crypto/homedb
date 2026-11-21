export type CloudDataSource = 'stored' | 'missing' | 'disabled'
export type InitialSyncAction = 'use-cloud' | 'upload-local' | 'keep-local'
export type SyncMarkerStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const PENDING_SYNC_KEY = 'mininav_pending_sync'

export function decideInitialSync({
  source,
  hasPendingLocal,
  localCorrupt = false,
}: {
  source: CloudDataSource
  hasPendingLocal: boolean
  localCorrupt?: boolean
}): InitialSyncAction {
  if (source === 'disabled') return 'keep-local'
  if (localCorrupt) return source === 'stored' ? 'use-cloud' : 'keep-local'
  if (hasPendingLocal || source === 'missing') return 'upload-local'
  return 'use-cloud'
}

export function hasPendingSync(storage?: SyncMarkerStorage | null): boolean {
  if (!storage) return false
  try {
    return storage.getItem(PENDING_SYNC_KEY) === '1'
  } catch {
    return false
  }
}

export function setPendingSync(
  storage: SyncMarkerStorage | null | undefined,
  pending: boolean
): boolean {
  if (!storage) return false
  try {
    if (pending) {
      storage.setItem(PENDING_SYNC_KEY, '1')
    } else {
      storage.removeItem(PENDING_SYNC_KEY)
    }
    return true
  } catch {
    return false
  }
}
