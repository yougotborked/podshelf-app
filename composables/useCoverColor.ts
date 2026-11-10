import { Capacitor } from '@capacitor/core'
import { FastAverageColor } from 'fast-average-color'

/**
 * Whether a cover has to be fetched natively before it can be sampled.
 *
 * FastAverageColor draws the image to a canvas and reads the pixels back, which the browser only
 * allows for same-origin images. A cover served from the Audiobookshelf server is cross-origin to
 * the webview, and the webview strips the origin header, so the canvas ends up tainted and the
 * read throws.
 */
export function shouldFetchCoverViaNativeHttp(coverUrl: string): boolean {
  if (!coverUrl || typeof coverUrl !== 'string') return false
  if (!coverUrl.startsWith('http://') && !coverUrl.startsWith('https://')) return false
  try {
    return new URL(coverUrl).origin !== window.location.origin
  } catch {
    return false
  }
}

/** Normalizes the shapes CapacitorHttp returns for a binary response into a Blob. */
export function imageHttpDataToBlob(data: unknown, mimeType = 'image/jpeg'): Blob | null {
  if (data == null) return null
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data
  if (data instanceof ArrayBuffer) return new Blob([data], { type: mimeType })
  if (ArrayBuffer.isView(data)) return new Blob([data as unknown as BlobPart], { type: mimeType })
  if (typeof data === 'object' && typeof (data as { base64?: unknown }).base64 === 'string') {
    return base64ToBlob((data as { base64: string }).base64, mimeType)
  }
  if (typeof data === 'string') {
    if (data.startsWith('data:')) {
      const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(data)
      if (match && match[2]) return base64ToBlob(match[2], match[1] || mimeType)
    }
    try {
      return base64ToBlob(data, mimeType)
    } catch {
      return null
    }
  }
  return null
}

function base64ToBlob(base64: string, type: string): Blob {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return new Blob([bytes], { type })
}

/**
 * Average colour of a cover, used to tint the player and item backgrounds.
 *
 * Cross-origin covers are pulled down with CapacitorHttp (which is not subject to webview CORS)
 * and sampled through a same-origin blob URL instead.
 */
export async function getAverageColorFromCoverUrl(fullCoverUrl: string): Promise<{ rgba: string; isLight: boolean } | null> {
  if (!fullCoverUrl) return null

  const fac = new FastAverageColor()
  let objectUrl: string | null = null
  try {
    let resource: string = fullCoverUrl

    if (Capacitor.isNativePlatform() && shouldFetchCoverViaNativeHttp(fullCoverUrl)) {
      const raw = await useNativeHttp().get(fullCoverUrl, {
        responseType: 'blob',
        connectTimeout: 15000,
        readTimeout: 30000
      })
      const blob = imageHttpDataToBlob(raw)
      if (!blob) throw new Error('Cover image response could not be converted to a blob')
      objectUrl = URL.createObjectURL(blob)
      resource = objectUrl
    }

    const color = await fac.getColorAsync(resource)
    return { rgba: color.rgba, isLight: color.isLight }
  } catch (e) {
    console.error('[coverAverageColor]', e)
    return null
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    fac.destroy()
  }
}
