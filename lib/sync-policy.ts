export type CloudDataSource = 'stored' | 'missing' | 'disabled'
export type InitialSyncAction = 'use-cloud' | 'upload-local' | 'keep-local'
export type SyncMarkerStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const PENDING_SYNC_KEY = 'mininav_pending_sync'
export const CLOUD_ETAG_KEY = 'mininav_cloud_etag'
export const CLOUD_MISSING_SENTINEL = '__missing__'

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

export function getStoredCloudEtag(
  storage?: SyncMarkerStorage | null
): string | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(CLOUD_ETAG_KEY)?.trim()
    return raw ? raw : null
  } catch {
    return null
  }
}

export function setStoredCloudEtag(
  storage: SyncMarkerStorage | null | undefined,
  etag: string | null
): boolean {
  if (!storage) return false
  try {
    if (etag) {
      storage.setItem(CLOUD_ETAG_KEY, etag)
    } else {
      storage.removeItem(CLOUD_ETAG_KEY)
    }
    return true
  } catch {
    return false
  }
}
