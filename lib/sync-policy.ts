export type CloudDataSource = 'stored' | 'missing' | 'disabled'
export type InitialSyncAction = 'use-cloud' | 'upload-local' | 'keep-local'
type SyncMarkerStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const PENDING_SYNC_KEY = 'mininav_pending_sync'

export function decideInitialSync({
  source,
  hasPendingLocal,
}: {
  source: CloudDataSource
  hasPendingLocal: boolean
}): InitialSyncAction {
  if (source === 'disabled') return 'keep-local'
  if (hasPendingLocal || source === 'missing') return 'upload-local'
  return 'use-cloud'
}

export function hasPendingSync(storage: SyncMarkerStorage): boolean {
  return storage.getItem(PENDING_SYNC_KEY) === '1'
}

export function setPendingSync(storage: SyncMarkerStorage, pending: boolean): void {
  if (pending) {
    storage.setItem(PENDING_SYNC_KEY, '1')
  } else {
    storage.removeItem(PENDING_SYNC_KEY)
  }
}
