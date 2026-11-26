// Shared bits of the admin QR components (client side, no QR/PDF libraries here:
// images and PDFs come from GET /api/exhibitions/:id/qr).
import { isTemporaryAddress } from '../lib/short-link'
import { toId, type Ref } from '../lib/visibility'

// The id of an upload/relationship value of the admin form, as text
export function refId(ref: unknown): string | null {
  const id = toId(ref as Ref)

  return id === null ? null : String(id)
}

export function qrEndpoint(api: string, exhibitionId: number | string, params: Record<string, string>) {
  return `${api}/exhibitions/${encodeURIComponent(String(exhibitionId))}/qr?${new URLSearchParams(params)}`
}

// Hints shown next to the QR buttons
export function qrWarnings(options: { visibility?: unknown; release?: unknown; serverURL: string }): string[] {
  const warnings: string[] = []

  if (options.release === 'planning' || (options.visibility || 'locked') === 'locked') {
    warnings.push(
      'QR codes will show “not available yet” until the release is not Planning and the visibility is “Locked with link” or “Public”.',
    )
  }

  if (isTemporaryAddress(options.serverURL)) {
    warnings.push(
      `QR codes would point to a temporary address (${options.serverURL}). Set PAYLOAD_PUBLIC_SERVER_URL to the real domain before printing.`,
    )
  }

  return warnings
}

// Copies the PNG behind the URL as an image. The ClipboardItem gets the promise directly,
// which Safari requires (the copy has to start inside the click).
export async function copyImageFromUrl(url: string): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    return false
  }

  const blob = fetch(url, { credentials: 'same-origin' }).then((response) => {
    if (!response.ok) {
      throw new Error('HTTP ' + response.status)
    }

    return response.blob()
  })

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}
