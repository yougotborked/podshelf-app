import { AbsDatabase } from '~/plugins/capacitor'
import type { LibraryItem, LocalFolder, LocalMediaProgress, MediaItemHistory } from '~/types'

class DbService {
  getDeviceData(): Promise<unknown> {
    return AbsDatabase.getDeviceData().then((data: unknown) => {
      console.log('Loaded device data', JSON.stringify(data))
      return data
    })
  }

  async getRefreshToken(serverConnectionConfigId: string): Promise<string | null> {
    const refreshTokenData = await AbsDatabase.getRefreshToken({ serverConnectionConfigId }) as { refreshToken?: string } | null
    return refreshTokenData?.refreshToken ?? null
  }

  async clearRefreshToken(serverConnectionConfigId: string): Promise<boolean> {
    const result = await AbsDatabase.clearRefreshToken({ serverConnectionConfigId }) as { success?: boolean } | null
    return !!result?.success
  }

  setServerConnectionConfig(serverConnectionConfig: Record<string, unknown>): Promise<unknown> {
    return AbsDatabase.setCurrentServerConnectionConfig(serverConnectionConfig).then((data: unknown) => {
      console.log('Set server connection config', JSON.stringify(data))
      return data
    })
  }

  removeServerConnectionConfig(serverConnectionConfigId: string): Promise<boolean> {
    return AbsDatabase.removeServerConnectionConfig({ serverConnectionConfigId }).then(() => {
      console.log('Removed server connection config', serverConnectionConfigId)
      return true
    })
  }

  logout(): Promise<unknown> {
    return AbsDatabase.logout()
  }

  getLocalFolders(): Promise<LocalFolder[] | null> {
    return AbsDatabase.getLocalFolders()
      .then((data: { value: LocalFolder[] }) => data.value)
      .catch((error: Error) => {
        console.error('Failed to load', error)
        return null
      })
  }

  getLocalFolder(folderId: string): Promise<LocalFolder | null> {
    return AbsDatabase.getLocalFolder({ folderId }).then((data: unknown) => {
      console.log('Got local folder', JSON.stringify(data))
      return data
    })
  }

  getLocalLibraryItemsInFolder(folderId: string): Promise<LibraryItem[]> {
    return AbsDatabase.getLocalLibraryItemsInFolder({ folderId }).then((data: { value: LibraryItem[] }) => data.value)
  }

  getLocalLibraryItems(mediaType: string | null = null): Promise<LibraryItem[]> {
    return AbsDatabase.getLocalLibraryItems({ mediaType }).then((data: { value: LibraryItem[] }) => data.value)
  }

  getLocalLibraryItem(id: string): Promise<LibraryItem | null> {
    return AbsDatabase.getLocalLibraryItem({ id })
  }

  getLocalLibraryItemByLId(libraryItemId: string): Promise<LibraryItem | null> {
    return AbsDatabase.getLocalLibraryItemByLId({ libraryItemId })
  }

  getAllLocalMediaProgress(): Promise<unknown[]> {
    return AbsDatabase.getAllLocalMediaProgress().then((data: { value: unknown[] }) => data.value)
  }

  getLocalMediaProgressForServerItem(payload: Record<string, unknown>): Promise<unknown> {
    return AbsDatabase.getLocalMediaProgressForServerItem(payload)
  }

  removeLocalMediaProgress(localMediaProgressId: string): Promise<unknown> {
    return AbsDatabase.removeLocalMediaProgress({ localMediaProgressId })
  }

  syncLocalSessionsWithServer(isFirstSync: boolean): Promise<unknown> {
    return AbsDatabase.syncLocalSessionsWithServer({ isFirstSync })
  }

  syncServerMediaProgressWithLocalMediaProgress(payload: Record<string, unknown>): Promise<unknown> {
    return AbsDatabase.syncServerMediaProgressWithLocalMediaProgress(payload)
  }

  updateLocalTrackOrder(payload: Record<string, unknown>): Promise<unknown> {
    return AbsDatabase.updateLocalTrackOrder(payload)
  }

  /** `error` is set when the native layer could not record it; the progress record comes back on success. */
  updateLocalMediaProgressFinished(payload: Record<string, unknown>): Promise<{ error?: string; localMediaProgress?: LocalMediaProgress | null } | null> {
    return AbsDatabase.updateLocalMediaProgressFinished(payload)
  }

  updateLocalEbookProgress(payload: Record<string, unknown>): Promise<unknown> {
    return AbsDatabase.updateLocalEbookProgress(payload)
  }

  updateDeviceSettings(payload: Record<string, unknown>): Promise<unknown> {
    return AbsDatabase.updateDeviceSettings(payload)
  }

  getMediaItemHistory(mediaId: string): Promise<MediaItemHistory | null> {
    return AbsDatabase.getMediaItemHistory({ mediaId })
  }
}

let _db: DbService | null = null

export function useDb(): DbService {
  if (!_db) _db = new DbService()
  return _db
}
